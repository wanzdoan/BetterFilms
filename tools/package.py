"""Package the runtime only; exclude research, test fixtures and dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parent.parent
runtime = root / "extension"
version = json.loads((runtime / "manifest.json").read_text(encoding="utf-8"))["version"]
dist = root / "dist"
dist.mkdir(exist_ok=True)
target = dist / f"BetterFilms-{version}.zip"
with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    for file in sorted(runtime.rglob("*")):
        if file.is_file():
            archive.write(file, Path("BetterFilms") / file.relative_to(runtime))
    archive.write(root / "README.md", "HUONG-DAN.md")
with ZipFile(target) as archive:
    assert "BetterFilms/manifest.json" in archive.namelist()
    assert not any("node_modules" in n or "fixtures" in n or "research" in n for n in archive.namelist())
    assert archive.testzip() is None
sha = hashlib.sha256(target.read_bytes()).hexdigest()
checksums = []
for extension in ("zip", "crx"):
    artifact = dist / f"BetterFilms-{version}.{extension}"
    if artifact.exists():
        checksums.append(f"{hashlib.sha256(artifact.read_bytes()).hexdigest()}  {artifact.name}")
(dist / "SHA256.txt").write_text("\n".join(checksums) + "\n", encoding="utf-8")
print(target)
print(f"{target.stat().st_size:,} bytes; SHA-256 {sha}")
