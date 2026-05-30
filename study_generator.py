import os
import sys
import json
import argparse
import datetime
import requests
from google import generativeai as genai
from duckduckgo_search import DDGS

# Parse terminal arguments
parser = argparse.ArgumentParser(description="Anthropology Daily Study Material Generator")
parser.add_argument("--unit", type=str, default="", help="Specific Unit to generate (e.g. Unit 1.6)")
parser.add_argument("--prompt", type=str, default="", help="Custom value-add prompt focus")
args = parser.parse_args()

# Setup API keys from environments
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")

if not GEMINI_API_KEY or not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
    print("CRITICAL ERROR: Missing required environment variables.")
    print("Ensure GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, and TELEGRAM_CHAT_ID are set in GitHub Secrets.")
    sys.exit(1)

# Configure Gemini
genai.configure(api_key=GEMINI_API_KEY)

# Load bundled notes data
data_file = "docs/data.json"
notes_data = []
if os.path.exists(data_file):
    with open(data_file, 'r') as f:
        notes_data = json.load(f)

print(f"Loaded {len(notes_data)} existing syllabus notes from data.json.")

# Determine target note/unit
target_note = None
selected_title = ""
selected_units = []
existing_content = ""

if args.unit:
    # Match user-specified unit (e.g. "1.6")
    clean_unit_query = args.unit.lower().replace("unit", "").strip()
    for note in notes_data:
        # Check if query matches filename, title, or units list
        note_units_lower = [u.lower() for u in note.get("units", [])]
        if any(clean_unit_query in u for u in note_units_lower) or clean_unit_query in note.get("title", "").lower() or clean_unit_query in note.get("filename", "").lower():
            target_note = note
            break
else:
    # Sequential rotation based on hour/day to cycle automatically through the 22 notes
    if notes_data:
        now = datetime.datetime.utcnow()
        day_of_year = now.timetuple().tm_yday
        # Determine slot based on 8-hour blocks (3 times a day)
        slot = (day_of_year * 3 + now.hour // 8) % len(notes_data)
        target_note = notes_data[slot]

if target_note:
    selected_title = target_note.get("title", "Anthropology Revision Sheet")
    selected_units = target_note.get("units", [])
    existing_content = target_note.get("content", "")
    print(f"Target selected: {selected_title} ({', '.join(selected_units)})")
else:
    # Fallback if no notes data or no match found
    selected_title = f"Anthropology Revision Sheet for {args.unit or 'General Topics'}"
    selected_units = [args.unit] if args.unit else ["General Revision"]
    existing_content = "No existing note content. Generate comprehensive materials from scratch."
    print(f"No specific matching note found. Creating study material for: {selected_title}")

# 1. Fetch web value-add search results (DuckDuckGo Search)
search_query = f"UPSC Anthropology optional {selected_title} notes value addition case studies current affairs"
print(f"Performing DuckDuckGo web search: '{search_query}'...")
web_context = ""
try:
    with DDGS() as ddgs:
        results = list(ddgs.text(search_query, max_results=5))
        for idx, r in enumerate(results):
            web_context += f"Source [{idx+1}]: {r.get('title')}\nSnippet: {r.get('body')}\nURL: {r.get('href')}\n\n"
except Exception as e:
    print(f"Web search encountered an error: {e}. Proceeding without web context.")
    web_context = "No recent web search snippets available."

# 2. Build high-yield study material prompt
system_instructions = (
    "You are Antigravity AI, an elite UPSC Civil Services exam coach specializing in the Anthropology Optional paper.\n"
    "Your task is to compile premium, high-yield revision reading material that enables the candidate to score 300+ marks in the optional exam.\n"
    "Structure your response beautifully in Markdown. Make sure it contains:\n"
    "1. An elegant, condensed summary of core concepts with proper definitions.\n"
    "2. Scholars and Thinkers citations: Explicitly mention name-dropping thinkers, their books, and field studies in bold (e.g. **M.N. Srinivas (Religion and Society among Coorgs, 1952)**).\n"
    "3. Value-Addition Points: Incorporate recent reports, case studies, tribal committees (e.g. **Xaxa Committee (2014)**, **Elwin Committee**), or recent archaeological excavations.\n"
    "4. Proper Markdown Tables: Compare theories, evolutionary stages, physical features, or developmental indicators.\n"
    "5. Proper Mermaid flowcharts/diagrams: Synthesize complex mechanisms, tribal migrations, or lineage structures. Keep Mermaid code strictly valid to render easily.\n"
    "6. Model Exam Question & Structure: Provide a typical 10/15/20 marks exam question on this topic and sketch a high-scoring structured answer template (Introduction, Body points, Diagram reference, and Conclusion)."
)

prompt = f"""
Syllabus Topic: {selected_title}
Mapped Units: {', '.join(selected_units)}

Existing Notes Content (Use this as your foundation):
---
{existing_content}
---

Recent Web Value-Add Data (Incorporate these current case studies, reports, or discoveries where relevant):
---
{web_context}
---

Candidate Specific Request:
{args.prompt or "Perform a general revision sheet, optimize value-add case studies, draw elegant diagrams, and organize thinkers references."}

Generate the comprehensive reading material:
"""

print("Querying Gemini models with fallback strategies...")
model_names_to_try = [
    'gemini-3.5-flash',
    'gemini-3.1-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest'
]

study_material = None
error_messages = []

for m_name in model_names_to_try:
    print(f"Trying model: {m_name}...")
    try:
        model = genai.GenerativeModel(m_name)
        response = model.generate_content(
            contents=prompt,
            generation_config={"temperature": 0.3}
        )
        study_material = response.text
        print(f"✅ Success generating content with model: {m_name}!")
        break
    except Exception as e:
        err_msg = str(e)
        error_messages.append(f"{m_name}: {err_msg}")
        print(f"⚠️ Model {m_name} failed: {err_msg}")

if not study_material:
    print("\n❌ CRITICAL ERROR: All models failed to generate content.")
    print("Listing available models from your API key for debugging:")
    try:
        for m in genai.list_models():
            print(f"  - {m.name} (supports: {m.supported_generation_methods})")
    except Exception as list_err:
        print(f"Could not list models: {list_err}")
    
    print("\nDetailed errors for each model tried:")
    for err in error_messages:
        print(f"  {err}")
    sys.exit(1)

# 3. Save generated content to a markdown file to send as a document
file_safe_title = selected_title.replace(" ", "_").replace("/", "-").replace(":", "").replace("—", "_")[:40]
filename = f"Anthro_Revision_{file_safe_title}.md"

with open(filename, 'w') as f:
    f.write(f"# DAILY ANTHROPOLOGY STUDY SHEET\n")
    f.write(f"**Date:** {datetime.date.today().strftime('%B %d, %Y')} | **Target:** {selected_title}\n")
    f.write(f"**Syllabus Mapping:** {', '.join(selected_units)}\n\n")
    f.write(study_material)

print(f"Successfully saved generated revision sheet to file: {filename}")

# 4. Route output via Telegram Bot API
print("Sending generated revision sheet to Telegram...")

# Send file attachment
try:
    with open(filename, 'rb') as f:
        files = {'document': f}
        data = {
            'chat_id': TELEGRAM_CHAT_ID,
            'caption': (
                f"📚 *DAILY STUDY SHEET GENERATED*\n\n"
                f"🎯 *Topic:* {selected_title}\n"
                f"📌 *Syllabus Units:* {', '.join(selected_units)}\n"
                f"⚡ *Features:* Internet Value-Add, Scholar citations, Diagrams, and Model Answers."
            ),
            'parse_mode': 'Markdown'
        }
        res = requests.post(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendDocument", data=data, files=files)
        if res.status_code == 200:
            print("Telegram document delivery successful!")
        else:
            print(f"Telegram document delivery failed with status: {res.status_code}, response: {res.text}")
            # Fallback to simple text message if document upload fails
            text_data = {
                'chat_id': TELEGRAM_CHAT_ID,
                'text': f"📚 *Daily Revision Alert: {selected_title}*\n\nDue to payload sizes, please check your repository. Study sheet compiled successfully!",
                'parse_mode': 'Markdown'
            }
            requests.post(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage", data=text_data)
except Exception as e:
    print(f"Telegram delivery encountered an exception: {e}")
