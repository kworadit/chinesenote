from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os
import glob
import re
from lxml import etree
from typing import List, Optional
import time

app = FastAPI()

# Enable CORS for React development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class Card(BaseModel):
    id: str  # using 'created' timestamp as ID
    headword_sc: str
    headword_tc: str
    pinyin: str
    defn: str
    remark: Optional[str] = None

class NewCard(BaseModel):
    headword_sc: str
    headword_tc: str
    pinyin: str
    defn: str
    force: Optional[bool] = False

def get_xml_files():
    files = glob.glob("chinese*.xml")
    return sorted(files, reverse=True)

@app.get("/files")
def list_files():
    return [{"filename": f, "date": f[7:15]} for f in get_xml_files()]

@app.get("/cards/{filename}")
def get_cards(filename: str):
    if not os.path.exists(filename):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        parser = etree.XMLParser(remove_blank_text=True)
        tree = etree.parse(filename, parser)
        root = tree.getroot()
        cards = []
        for card_el in root.xpath("//card"):
            entry = card_el.find("entry")
            remark_el = card_el.find("remark")
            cards.append({
                "id": card_el.get("created"),
                "headword_sc": entry.find("headword[@charset='sc']").text if entry.find("headword[@charset='sc']") is not None else "",
                "headword_tc": entry.find("headword[@charset='tc']").text if entry.find("headword[@charset='tc']") is not None else "",
                "pinyin": entry.find("pron").text if entry.find("pron") is not None else "",
                "defn": entry.find("defn").text if entry.find("defn") is not None else "",
                "remark": remark_el.text if remark_el is not None else ""
            })
        return cards
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/cards/{filename}/{card_id}/remark")
def update_remark(filename: str, card_id: str, remark: dict):
    if not os.path.exists(filename):
        raise HTTPException(status_code=404, detail="File not found")
    
    parser = etree.XMLParser(remove_blank_text=True)
    tree = etree.parse(filename, parser)
    root = tree.getroot()
    
    card_el = root.xpath(f"//card[@created='{card_id}']")
    if not card_el:
        raise HTTPException(status_code=404, detail="Card not found")
    
    card_el = card_el[0]
    remark_text = remark.get("remark", "")
    
    remark_el = card_el.find("remark")
    if remark_el is None:
        remark_el = etree.SubElement(card_el, "remark")
    
    remark_el.text = remark_text
    tree.write(filename, encoding="UTF-8", xml_declaration=True, pretty_print=True)
    return {"status": "success"}

@app.post("/cards/{filename}/add")
def add_card(filename: str, new_card: NewCard):
    if not os.path.exists(filename):
        raise HTTPException(status_code=404, detail="File not found")
    
    if not new_card.force:
        for f in get_xml_files():
            try:
                p = etree.XMLParser(remove_blank_text=True)
                t = etree.parse(f, p)
                r = t.getroot()
                for c_el in r.xpath("//card"):
                    e_el = c_el.find("entry")
                    hw = e_el.find("headword[@charset='sc']")
                    if hw is not None and hw.text == new_card.headword_sc:
                        return JSONResponse(
                            status_code=409,
                            content={"detail": f"Duplicate word found in {f[7:15]}"}
                        )
            except:
                continue

    parser = etree.XMLParser(remove_blank_text=True)
    tree = etree.parse(filename, parser)
    root = tree.getroot()
    
    cards_el = root.find("cards")
    if cards_el is None:
        cards_el = etree.SubElement(root, "cards")
    
    timestamp = str(int(time.time()))
    card_el = etree.SubElement(cards_el, "card", {
        "language": "chinese",
        "created": timestamp,
        "modified": timestamp
    })
    
    entry_el = etree.SubElement(card_el, "entry")
    etree.SubElement(entry_el, "headword", charset="sc").text = new_card.headword_sc
    etree.SubElement(entry_el, "headword", charset="tc").text = new_card.headword_tc
    etree.SubElement(entry_el, "pron", type="hypy", tones="numbers").text = new_card.pinyin
    etree.SubElement(entry_el, "defn").text = new_card.defn
    
    tree.write(filename, encoding="UTF-8", xml_declaration=True, pretty_print=True)
    return {"status": "success", "id": timestamp}

@app.get("/search")
def search_cards(sc: Optional[str] = None, pinyin: Optional[str] = None, defn: Optional[str] = None, remark: Optional[str] = None):
    all_results = []
    for filename in get_xml_files():
        try:
            parser = etree.XMLParser(remove_blank_text=True)
            tree = etree.parse(filename, parser)
            root = tree.getroot()
            for card_el in root.xpath("//card"):
                entry = card_el.find("entry")
                def get_text(el, path):
                    found = el.find(path)
                    return (found.text if found is not None and found.text is not None else "")

                h_sc = get_text(entry, "headword[@charset='sc']")
                h_tc = get_text(entry, "headword[@charset='tc']")
                p = get_text(entry, "pron")
                d = get_text(entry, "defn")
                r_el = card_el.find("remark")
                r = r_el.text if r_el is not None and r_el.text is not None else ""
                
                match = True
                if sc and sc.lower() not in h_sc.lower() and sc.lower() not in h_tc.lower():
                    match = False
                if pinyin:
                    q_p = pinyin.lower()
                    s_p = p.lower()
                    # If query has no digits, ignore tones in the stored pinyin
                    if not any(char.isdigit() for char in q_p):
                        s_p = re.sub(r'\d', '', s_p)
                    
                    if q_p not in s_p:
                        match = False
                if defn and defn.lower() not in d.lower():
                    match = False
                if remark and remark.lower() not in r.lower():
                    match = False
                
                if match and (sc or pinyin or defn or remark):
                    all_results.append({
                        "filename": filename,
                        "date": filename[7:15],
                        "id": card_el.get("created"),
                        "headword_sc": h_sc,
                        "headword_tc": h_tc,
                        "pinyin": p,
                        "defn": d,
                        "remark": r
                    })
        except:
            continue
    return all_results

@app.delete("/cards/{filename}/{card_id}")
def delete_card(filename: str, card_id: str):
    if not os.path.exists(filename):
        raise HTTPException(status_code=404, detail="File not found")
    
    parser = etree.XMLParser(remove_blank_text=True)
    tree = etree.parse(filename, parser)
    root = tree.getroot()
    
    card_el = root.xpath(f"//card[@created='{card_id}']")
    if not card_el:
        raise HTTPException(status_code=404, detail="Card not found")
    
    parent = card_el[0].getparent()
    parent.remove(card_el[0])
    
    tree.write(filename, encoding="UTF-8", xml_declaration=True, pretty_print=True)
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
