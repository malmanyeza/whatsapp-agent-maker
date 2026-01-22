
import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

/**
 * Generates a PDF Quote and returns the Buffer
 * @param {Object} quoteData - { company: { name, address, phone, logo_url }, customer: { name }, items: [ { name, qty, price, total } ], total, currencySymbol }
 * @returns {Promise<Buffer>}
 */
export async function generatePDFQuote(quoteData) {
    // 1. Fetch Logo first (Async)
    let logoBuffer = null;
    if (quoteData.company.logo_url) {
        try {
            console.log(`[DEBUG] Fetching logo from: ${quoteData.company.logo_url}`);
            const response = await fetch(quoteData.company.logo_url);
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                logoBuffer = Buffer.from(arrayBuffer);
            } else {
                console.error(`[DEBUG] Failed to fetch logo. Status: ${response.status}`);
            }
        } catch (e) {
            console.error("[DEBUG] Failed to load logo:", e);
        }
    }

    // 2. Generate PDF (Sync logic wrapped in Promise)
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const hasLogo = !!logoBuffer;

            // --- Header ---
            // Left-aligned Logo (larger size: 150px)
            if (hasLogo) {
                // Left-aligned at margin, increased size
                doc.image(logoBuffer, 50, 45, { width: 150 });
                doc.moveDown(5); // Move down past the larger logo
            } else {
                // Fallback if no logo: show text left-aligned
                doc
                    .fontSize(20)
                    .text(quoteData.company.name || 'Company Name', { align: 'left' })
                    .fontSize(10)
                    .text(quoteData.company.description || '', { align: 'left' })
                    .moveDown();
            }

            // --- Quote Details ---
            doc
                .fontSize(20)
                .text('QUOTATION', 50, 160)
                .fontSize(10)
                .text(`Quote Number: ${uuidv4().split('-')[0].toUpperCase()}`, 50, 200)
                .text(`Date: ${new Date().toLocaleDateString()}`, 50, 215)
                .text(`To: ${quoteData.customer.name || 'Valued Customer'}`, 300, 200)
                .moveDown();

            // --- Table Header ---
            const tableTop = 330;
            doc.font("Helvetica-Bold");
            generateTableRow(
                doc,
                tableTop,
                "Item",
                "Description",
                "Unit Cost",
                "Quantity",
                "Line Total"
            );
            generateHr(doc, tableTop + 20);
            doc.font("Helvetica");

            // --- Table Rows ---
            let i = 0;
            for (i = 0; i < quoteData.items.length; i++) {
                const item = quoteData.items[i];
                const position = tableTop + (i + 1) * 30;
                generateTableRow(
                    doc,
                    position,
                    item.name,
                    item.description || "",
                    formatCurrency(item.unit_price, quoteData.currencySymbol),
                    item.qty,
                    formatCurrency(item.total, quoteData.currencySymbol)
                );
                generateHr(doc, position + 20);
            }

            // --- Footer / Total ---
            const subtotalPosition = tableTop + (i + 1) * 30;
            doc.font("Helvetica-Bold");
            generateTableRow(
                doc,
                subtotalPosition,
                "",
                "",
                "Total",
                "",
                formatCurrency(quoteData.total, quoteData.currencySymbol)
            );

            // End Document
            doc.end();

        } catch (e) {
            reject(e);
        }
    });
}

function generateTableRow(doc, y, item, description, unitCost, quantity, lineTotal) {
    doc
        .fontSize(10)
        .text(item, 50, y)
        .text(description, 150, y)
        .text(unitCost, 280, y, { width: 90, align: "right" })
        .text(quantity, 370, y, { width: 90, align: "right" })
        .text(lineTotal, 0, y, { align: "right" });
}

function generateHr(doc, y) {
    doc
        .strokeColor("#aaaaaa")
        .lineWidth(1)
        .moveTo(50, y)
        .lineTo(550, y)
        .stroke();
}

function formatCurrency(cents, symbol = '$') {
    if (cents === undefined || cents === null) return symbol + "0.00";
    return symbol + (cents).toFixed(2);
}
