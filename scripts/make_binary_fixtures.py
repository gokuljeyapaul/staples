"""Regenerates the checked-in binary fixtures in tests/fixtures.
   pip install pikepdf pillow   then   python scripts/make_binary_fixtures.py"""
from pathlib import Path
import pikepdf
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
out.mkdir(parents=True, exist_ok=True)

def base_pdf(pages):
    pdf = pikepdf.new()
    for i in range(pages):
        content = f"BT /F1 24 Tf 72 720 Td (LOCKED PAGE {i+1}) Tj ET".encode()
        page = pikepdf.Dictionary(
            Type=pikepdf.Name.Page, MediaBox=[0, 0, 595, 842],
            Resources=pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=pikepdf.Dictionary(
                Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.Helvetica))),
            Contents=pdf.make_stream(content))
        pdf.pages.append(pikepdf.Page(page))
    return pdf

# Opens without a password but is encrypted (typical government-portal PDF).
base_pdf(2).save(out / "Locked_Owner_Only.pdf",
    encryption=pikepdf.Encryption(owner="owner-secret", user="", R=4,
        allow=pikepdf.Permissions(modify_other=False, extract=False)))
# Needs a password just to open.
base_pdf(1).save(out / "Password_Required.pdf",
    encryption=pikepdf.Encryption(owner="owner-secret", user="open-sesame", R=4))

img = Image.new("RGB", (600, 400), (43, 47, 217))
ImageDraw.Draw(img).rectangle([40, 40, 560, 360], outline=(255, 225, 77), width=12)
img.save(out / "Passport_Scan.png")
img.rotate(90, expand=True).save(out / "Visa_Scan.jpg", quality=85)   # portrait 400x600
print("fixtures written to", out)
