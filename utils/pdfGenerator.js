
import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

/**
 * Generates a PDF Quote and returns the Buffer
 * @param {Object} quoteData - { company: { name, address, phone }, customer: { name }, items: [ { name, qty, price, total } ], total, currencySymbol }
 * @returns {Promise<Buffer>}
 */
export async function generatePDFQuote(quoteData) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            // --- Header ---
            doc
                .fontSize(20)
                .text(quoteData.company.name || 'Company Name', 110, 57)
                .fontSize(10)
                .text(quoteData.company.name, 200, 65, { align: 'right' })
                .text(quoteData.company.description || '', 200, 80, { align: 'right' })
                .moveDown();

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
        } catch (err) {
            reject(err);
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
    return symbol + (cents).toFixed(2);
}
