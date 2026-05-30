import os
import json
import re

base_dir = "/Users/ashish/Downloads/antigravity_ide/Anthropology_optional"
output_file = os.path.join(base_dir, "docs", "data.json")

def process_paper(paper_dir, paper_num, is_value_add=False):
    data = []
    flashcards = []
    if not os.path.exists(paper_dir): return data, flashcards
    
    for filename in sorted(os.listdir(paper_dir)):
        if not filename.endswith(".md"): continue
        filepath = os.path.join(paper_dir, filename)
        
        with open(filepath, 'r') as f:
            content = f.read()
            
        # Extract title from the first H1
        title_match = re.search(r'^#\s+(.+)', content, re.MULTILINE)
        title = title_match.group(1) if title_match else filename.replace('.md', '').replace('_', ' ').title()
        
        # Extract all units mentioned in Syllabus Mapping blocks
        units = []
        unit_matches = re.finditer(r'(?:Unit|UNIT)\s*(\d+(?:\.\d+)?)', content)
        for m in unit_matches:
            unit_num = m.group(1)
            clean_unit = f"Unit {unit_num}"
            if clean_unit not in units:
                units.append(clean_unit)
        
        data.append({
            "id": f"value_add_paper{paper_num}_{filename}" if is_value_add else f"paper{paper_num}_{filename}",
            "paper": paper_num,
            "filename": filename,
            "title": title,
            "units": units,
            "content": content,
            "value_add": is_value_add
        })
        
        # Extract Flashcards
        fc_matches = re.finditer(r'>\s*\[!(TIP|IMPORTANT)\]\n((?:>\s*.*\n?)+)', content)
        for m in fc_matches:
            type_tag = m.group(1)
            raw_content = m.group(2)
            # clean up blockquotes
            clean_content = re.sub(r'^>\s*', '', raw_content, flags=re.MULTILINE).strip()
            # Try to split on first colon or bold text for Front/Back if possible
            # Or simply: Front = title + unit, Back = content
            flashcards.append({
                "source_title": title,
                "type": type_tag,
                "content": clean_content
            })
            
    return data, flashcards

p1_data, p1_fc = process_paper(os.path.join(base_dir, "Paper_1"), 1)
p2_data, p2_fc = process_paper(os.path.join(base_dir, "Paper_2"), 2)

v1_data, v1_fc = process_paper(os.path.join(base_dir, "Value_Addition", "Paper_1"), 1, is_value_add=True)
v2_data, v2_fc = process_paper(os.path.join(base_dir, "Value_Addition", "Paper_2"), 2, is_value_add=True)

all_data = p1_data + p2_data + v1_data + v2_data
all_fc = p1_fc + p2_fc + v1_fc + v2_fc

with open(output_file, 'w') as f:
    json.dump(all_data, f, indent=2)

fc_file = os.path.join(base_dir, "docs", "flashcards.json")
with open(fc_file, 'w') as f:
    json.dump(all_fc, f, indent=2)

print(f"Successfully bundled {len(all_data)} notes and {len(all_fc)} flashcards.")
