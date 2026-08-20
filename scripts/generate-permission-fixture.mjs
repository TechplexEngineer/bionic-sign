import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFDocument, StandardFonts } from 'pdf-lib';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(projectRoot, 'src/lib/template/fixtures/permission-form.pdf');
const fixedDate = new Date('2026-08-20T00:00:00.000Z');

const document = await PDFDocument.create({ updateMetadata: false });
document.setCreationDate(fixedDate);
document.setModificationDate(fixedDate);
document.setCreator('bionic-sign fixture generator');
document.setProducer('pdf-lib');

const font = await document.embedFont(StandardFonts.Helvetica);
const headings = ['FIELD TRIP PERMISSION FORM — PAGE 1', 'MEDICAL AND SIGNATURE DETAILS — PAGE 2'];

for (const heading of headings) {
	const page = document.addPage([612, 792]);
	page.drawText(heading, { x: 54, y: 720, size: 16, font });
}

const bytes = await document.save({
	addDefaultPage: false,
	objectsPerTick: Number.POSITIVE_INFINITY
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, bytes);
