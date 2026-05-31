import os
import sys
import json
import argparse
import datetime
import requests
import re
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

# Gather all core (non-value-add) units and their papers
all_paper_units = []
for note in notes_data:
    if not note.get("value_add") and note.get("units"):
        for u in note.get("units"):
            pair = (note.get("paper", 1), u)
            if pair not in all_paper_units:
                all_paper_units.append(pair)

# Sort unit-paper pairs numerically by unit number, and then by paper
def parse_unit_num(unit_str):
    try:
        nums = re.findall(r'\d+(?:\.\d+)?', unit_str)
        if nums:
            return [float(x) for x in nums]
    except:
        pass
    return [999.0]

def sort_key(pair):
    paper, unit_str = pair
    return (paper, parse_unit_num(unit_str))

sorted_paper_units = sorted(all_paper_units, key=sort_key)
print(f"Discovered {len(sorted_paper_units)} unique core syllabus unit-paper pairs.")

selected_unit = ""
selected_paper = 1

if args.unit:
    # Match user-specified unit (e.g. "1.6" or "paper 2 unit 1.3")
    unit_query = args.unit.lower()
    
    # Detect if user specified paper 1 or paper 2
    specified_paper = None
    if "p2" in unit_query or "paper 2" in unit_query or "paper_2" in unit_query:
        specified_paper = 2
    elif "p1" in unit_query or "paper 1" in unit_query or "paper_1" in unit_query:
        specified_paper = 1
        
    clean_unit_query = unit_query.replace("unit", "").replace("paper", "").replace("p1", "").replace("p2", "").strip()
    clean_unit_query = re.sub(r'[\s\-_]+', '', clean_unit_query)
    
    # Try to find a match in sorted_paper_units
    matched_pair = None
    for paper, u in sorted_paper_units:
        u_clean = re.sub(r'[\s\-_]+', '', u.lower().replace("unit", ""))
        if clean_unit_query in u_clean:
            if specified_paper is None or paper == specified_paper:
                matched_pair = (paper, u)
                break
                
    if matched_pair:
        selected_paper, selected_unit = matched_pair
        print(f"Matched user input '{args.unit}' to Paper {selected_paper}, {selected_unit}")
    else:
        selected_paper = specified_paper if specified_paper is not None else 1
        selected_unit = f"Unit {args.unit.strip()}"
        print(f"No exact syllabus match for '{args.unit}'. Falling back to Paper {selected_paper}, {selected_unit}")
else:
    # Strict sequential selection: find the FIRST ungenerated (paper, unit)
    generated_pairs = set()
    for note in notes_data:
        if note.get("value_add"):
            p = note.get("paper", 1)
            if note.get("units"):
                for u in note.get("units"):
                    generated_pairs.add((p, u))
                    
    print(f"Found {len(generated_pairs)} already generated value-addition unit-paper pairs.")
    
    selected_pair = None
    for pair in sorted_paper_units:
        if pair not in generated_pairs:
            selected_pair = pair
            break
            
    if selected_pair:
        selected_paper, selected_unit = selected_pair
        print(f"Next sequential ungenerated unit selected: Paper {selected_paper}, {selected_unit}")
    else:
        # Fallback if ALL units have been generated: cycle using slot rotation to avoid blocking
        if sorted_paper_units:
            import datetime
            now = datetime.datetime.utcnow()
            day_of_year = now.timetuple().tm_yday
            slot = (day_of_year * 3 + now.hour // 8) % len(sorted_paper_units)
            selected_paper, selected_unit = sorted_paper_units[slot]
            print(f"All syllabus units generated! Falling back to rotation slot {slot}: Paper {selected_paper}, {selected_unit}")
        else:
            selected_paper = 1
            selected_unit = "Unit 1.1"
            print(f"No syllabus units found in data.json. Defaulting to Paper {selected_paper}, {selected_unit}")

# Find corresponding core note matching both selected_unit and selected_paper
target_note = None
for note in notes_data:
    if not note.get("value_add") and note.get("paper") == selected_paper:
        if note.get("units") and selected_unit in note.get("units"):
            target_note = note
            break

if target_note:
    selected_title = target_note.get("title", "Anthropology Revision Sheet")
    selected_units = [selected_unit]
    existing_content = target_note.get("content", "")
    print(f"Focused Unit Selected: {selected_unit} (Mapped to parent note: {selected_title})")
else:
    selected_title = f"Anthropology Optional Topic"
    selected_units = [selected_unit]
    existing_content = "No parent note found. Generate revision sheet from scratch."
    print(f"Focused Unit Selected: {selected_unit} (No parent note matched)")

# 1. Fetch web value-add search results (DuckDuckGo Search)
search_query = f"UPSC Anthropology optional {selected_unit} value addition case studies current affairs"
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

system_instructions = (
    "You are Antigravity AI, an elite UPSC Civil Services exam coach specializing in the Anthropology Optional paper.\n"
    "Your task is to compile premium, high-yield revision reading material that enables the candidate to score 300+ marks in the optional exam.\n"
    "Structure your response beautifully in Markdown. Make sure it contains:\n"
    "1. An elegant, condensed summary of core concepts with proper definitions.\n"
    "2. Scholars and Thinkers citations: Explicitly mention name-dropping thinkers, their books, and field studies in bold (e.g. **M.N. Srinivas (Religion and Society among Coorgs, 1952)**).\n"
    "3. Value-Addition Points: Incorporate recent reports, case studies, tribal committees (e.g. **Xaxa Committee (2014)**, **Elwin Committee**), or recent archaeological excavations.\n"
    "4. Proper Markdown Tables: Compare theories, evolutionary stages, physical features, or developmental indicators.\n"
    "5. Proper Mermaid flowcharts/diagrams: Synthesize complex mechanisms, tribal migrations, or lineage structures. Keep Mermaid code strictly valid to render easily. CRITICAL MERMAID INSTRUCTIONS:\n"
    "   - Do NOT output invalid, empty, or placeholder Mermaid code blocks (like 'grid-layout'). Every Mermaid block must start with a valid directive (e.g. 'graph TD', 'graph LR', 'sequenceDiagram', 'xychart-beta').\n"
    "   - In flowcharts (graph TD/LR), wrap ALL node text containing spaces, colons (:), ampersands (&), slashes (/), parentheses, or commas (,) in double quotes (e.g., A[\"Holistic Scope: Micro to Macro\"] instead of A[Holistic Scope: Micro to Macro]).\n"
    "   - Never use '<-->' as a bidirectional arrow in flowcharts. Instead, draw two separate arrows in opposite directions: A --> B and B --> A.\n"
    "   - Replace all bare ampersands (&) inside flowchart labels or connector text with the word 'and' to prevent parsing failures.\n"
    "   - For 'xychart-beta', wrap all labels in the 'x-axis' that contain spaces or special characters in double quotes (e.g., x-axis [\"Deep Past\", \"Modern Era\"]). Define the 'y-axis' range strictly with the 'min --> max' syntax (e.g., y-axis \"Title\" 0 --> 100), NEVER with brackets like [0, 10, 20].\n"
    "6. Model Exam Question & Structure: Provide a typical 10/15/20 marks exam question on this topic and sketch a high-scoring structured answer template (Introduction, Body points, Diagram reference, and Conclusion)."
)

prompt = f"""
Syllabus Unit to generate: {selected_unit}
Parent Chapter Topic: {selected_title}

Existing Notes Content (Use this as your core contextual foundation):
---
{existing_content}
---

Recent Web Value-Add Data (Incorporate these current case studies, reports, or discoveries where relevant):
---
{web_context}
---

Candidate Specific Request:
{args.prompt or "Perform a general revision sheet, optimize value-add case studies, draw elegant diagrams, and organize thinkers references."}

CRITICAL INSTRUCTION: Generate premium, high-yield value-addition study material specifically and ONLY for the syllabus unit '{selected_unit}'. Do not write about other units mentioned in the parent note. Keep the coverage extremely focused, detailed, yet beautifully bite-sized.
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

# 3. Save generated content in appropriate Value Addition directory to feed the web Reader app
if target_note and target_note.get("filename"):
    paper_num = target_note.get("paper", 1)
    orig_filename = target_note.get("filename").replace(".md", "")
    clean_unit_num = selected_unit.lower().replace("unit", "").strip().replace(".", "_")
    
    # Create the Value_Addition directory structure if it doesn't exist
    os.makedirs(f"Value_Addition/Paper_{paper_num}", exist_ok=True)
    
    filename = f"Value_Addition/Paper_{paper_num}/value_add_{orig_filename}_unit_{clean_unit_num}.md"
    clean_title = selected_title.replace("PAPER I — ", "").replace("PAPER II — ", "").replace("PAPER I \u2014 ", "").replace("PAPER II \u2014 ", "")
    display_title = f"VALUE ADD: {selected_unit} - {clean_title}"
else:
    file_safe_title = selected_title.replace(" ", "_").replace("/", "-").replace(":", "").replace("—", "_")[:40]
    filename = f"Anthro_Revision_{file_safe_title}.md"
    display_title = f"DAILY ANTHROPOLOGY STUDY SHEET: {selected_title}"

with open(filename, 'w') as f:
    f.write(f"# {display_title}\n")
    f.write(f"**Date:** {datetime.date.today().strftime('%B %d, %Y')} | **Target:** {selected_title}\n")
    f.write(f"**Syllabus Mapping:** {', '.join(selected_units)}\n\n")
    f.write(study_material)

print(f"Successfully saved generated revision sheet to: {filename}")

# Run compiler dynamically to bundle the new value-addition into data.json
print("Re-compiling website data.json bundle...")
try:
    import subprocess
    subprocess.run(["python", "docs/build_data.py"], check=True)
    print("Website data bundle compiled successfully!")
except Exception as build_err:
    print(f"Warning: Dynamic compilation of data.json failed: {build_err}")

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
                f"⚡ *Features:* Internet Value-Add, Scholar citations, Diagrams, and Model Answers.\n\n"
                f"🔗 *Read with Rendered Diagrams & Audio Reader here:*\n"
                f"https://ashish-upsc.github.io/anthro/"
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
