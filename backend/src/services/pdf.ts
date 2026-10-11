import PDFDocument from "pdfkit";
import MarkdownIt from "markdown-it";

export interface PdfOptions {
  repoName?: string;
  title?: string;
  updatedAt?: Date | string;
}

/**
 * Converts Markdown documentation into a clean, professional, publication-ready PDF buffer.
 */
export async function generateDocumentationPdf(
  markdown: string,
  options: PdfOptions = {}
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        bufferPages: true,
        info: {
          Title: options.title || "Repository Documentation",
          Author: "CodeSphere Intelligence Engine",
          Subject: `${options.repoName || "Project"} Architectural & Technical Documentation`,
          Keywords: "CodeSphere, Documentation, Architecture, Software",
          CreationDate: new Date(),
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      const md = new MarkdownIt({
        html: false,
        breaks: false,
        linkify: true,
      });

      const tokens = md.parse(markdown, {});

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 50;
      const contentWidth = pageWidth - margin * 2;
      const bottomLimit = pageHeight - margin - 35;

      const checkPageBreak = (neededHeight: number) => {
        if (doc.y + neededHeight > bottomLimit) {
          doc.addPage();
        }
      };

      // Top decorative primary header bar
      doc.rect(margin, margin, contentWidth, 3.5).fill("#4F46E5");
      doc.y = margin + 14;

      let inList = false;
      let isOrdered = false;
      let listIndex = 1;

      // Table parsing state
      let inTable = false;
      let tableHeaders: string[] = [];
      let tableRows: string[][] = [];
      let currentRow: string[] = [];

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // --- Headings ---
        if (token.type === "heading_open") {
          const level = parseInt(token.tag.replace("h", ""), 10) || 2;
          const nextInline = tokens[i + 1]?.type === "inline" ? tokens[i + 1].content : "";

          if (level === 1) {
            checkPageBreak(85);
            doc.moveDown(0.4);
            doc.fontSize(22).font("Helvetica-Bold").fillColor("#0F172A").text(nextInline, margin, doc.y, {
              width: contentWidth,
              lineGap: 3,
            });
            doc.moveDown(0.2);

            const dateStr = options.updatedAt
              ? new Date(options.updatedAt).toLocaleString()
              : new Date().toLocaleDateString();

            doc.fontSize(8.5).font("Helvetica").fillColor("#64748B").text(
              `CodeSphere Architecture & Technical Documentation • Generated: ${dateStr}`,
              margin,
              doc.y,
              { width: contentWidth }
            );
            doc.moveDown(0.4);
            doc.strokeColor("#E2E8F0").lineWidth(1).moveTo(margin, doc.y).lineTo(margin + contentWidth, doc.y).stroke();
            doc.moveDown(0.8);
          } else if (level === 2) {
            checkPageBreak(65);
            doc.moveDown(0.9);
            const headingY = doc.y;

            // Indigo accent badge marker
            doc.rect(margin, headingY + 1.5, 3.5, 13).fill("#4F46E5");

            doc.fontSize(13.5).font("Helvetica-Bold").fillColor("#0F172A").text(nextInline, margin + 10, headingY, {
              width: contentWidth - 10,
            });
            doc.moveDown(0.35);
          } else if (level === 3) {
            checkPageBreak(45);
            doc.moveDown(0.6);
            doc.fontSize(11).font("Helvetica-Bold").fillColor("#1E293B").text(nextInline, margin, doc.y, {
              width: contentWidth,
            });
            doc.moveDown(0.25);
          } else {
            checkPageBreak(35);
            doc.moveDown(0.4);
            doc.fontSize(10).font("Helvetica-Bold").fillColor("#334155").text(nextInline, margin, doc.y, {
              width: contentWidth,
            });
            doc.moveDown(0.2);
          }
          i++; // skip next inline token
        }

        // --- Paragraphs ---
        else if (token.type === "paragraph_open") {
          const nextInline = tokens[i + 1]?.type === "inline" ? tokens[i + 1] : null;
          if (nextInline && !inTable) {
            checkPageBreak(25);
            renderInlineText(doc, nextInline, {
              x: margin,
              width: contentWidth,
              fontSize: 9.5,
              textColor: "#334155",
            });
            doc.moveDown(0.4);
            i++;
          }
        }

        // --- Lists ---
        else if (token.type === "bullet_list_open") {
          inList = true;
          isOrdered = false;
        } else if (token.type === "bullet_list_close") {
          inList = false;
          doc.moveDown(0.3);
        } else if (token.type === "ordered_list_open") {
          inList = true;
          isOrdered = true;
          listIndex = 1;
        } else if (token.type === "ordered_list_close") {
          inList = false;
          doc.moveDown(0.3);
        } else if (token.type === "list_item_open") {
          const nextInlineToken = findNextInlineToken(tokens, i);
          if (nextInlineToken) {
            checkPageBreak(22);
            const prefix = isOrdered ? `${listIndex++}. ` : "•  ";
            const prefixWidth = isOrdered ? 18 : 12;

            const itemY = doc.y;
            // Draw list bullet / number
            doc.font(isOrdered ? "Helvetica" : "Helvetica-Bold")
              .fontSize(9)
              .fillColor(isOrdered ? "#64748B" : "#4F46E5")
              .text(prefix, margin + 4, itemY, { width: prefixWidth });

            // Draw list item body text indented
            doc.y = itemY;
            renderInlineText(doc, nextInlineToken, {
              x: margin + 4 + prefixWidth,
              width: contentWidth - (4 + prefixWidth),
              fontSize: 9.5,
              textColor: "#334155",
            });
            doc.moveDown(0.3);
          }
        }

        // --- Code Blocks (fence) ---
        else if (token.type === "fence") {
          const code = token.content.trimEnd();
          const lines = code.split("\n");
          const lineHeight = 11.5;
          const padding = 8;
          const boxHeight = lines.length * lineHeight + padding * 2;

          checkPageBreak(Math.min(boxHeight, 90));
          doc.moveDown(0.3);

          const startY = doc.y;

          // Background card
          doc.roundedRect(margin, startY, contentWidth, boxHeight, 4)
            .fillAndStroke("#F8FAFC", "#E2E8F0");

          // Code language tag if specified
          if (token.info) {
            doc.font("Helvetica-Bold").fontSize(7).fillColor("#94A3B8")
              .text(token.info.toUpperCase(), margin + contentWidth - 45, startY + 5, {
                width: 40,
                align: "right",
              });
          }

          doc.font("Courier").fontSize(8).fillColor("#0F172A");
          let lineY = startY + padding;
          for (const line of lines) {
            if (lineY > bottomLimit) {
              doc.addPage();
              lineY = margin + 10;
            }
            doc.text(line, margin + padding + 2, lineY, {
              width: contentWidth - padding * 2 - 4,
              lineBreak: false,
            });
            lineY += lineHeight;
          }
          doc.y = startY + boxHeight + 6;
        }

        // --- Tables ---
        else if (token.type === "table_open") {
          inTable = true;
          tableHeaders = [];
          tableRows = [];
        } else if (token.type === "tr_open") {
          currentRow = [];
        } else if (token.type === "tr_close") {
          if (tableHeaders.length === 0 && currentRow.length > 0) {
            tableHeaders = [...currentRow];
          } else if (currentRow.length > 0) {
            tableRows.push([...currentRow]);
          }
          currentRow = [];
        } else if (token.type === "inline" && inTable) {
          currentRow.push(token.content);
        } else if (token.type === "table_close") {
          inTable = false;
          if (tableHeaders.length > 0) {
            renderTable(doc, tableHeaders, tableRows, {
              margin,
              contentWidth,
              bottomLimit,
              checkPageBreak,
            });
          }
        }

        // --- Blockquotes ---
        else if (token.type === "blockquote_open") {
          const nextInlineToken = findNextInlineToken(tokens, i);
          if (nextInlineToken) {
            checkPageBreak(35);
            doc.moveDown(0.3);
            const bqY = doc.y;
            // Indigo left accent border
            doc.rect(margin, bqY, 3, 20).fill("#6366F1");
            doc.y = bqY + 2;
            renderInlineText(doc, nextInlineToken, {
              x: margin + 10,
              width: contentWidth - 15,
              fontSize: 9,
              textColor: "#64748B",
              isItalic: true,
            });
            doc.moveDown(0.35);
          }
        }

        // --- Horizontal Rule ---
        else if (token.type === "hr") {
          checkPageBreak(20);
          doc.moveDown(0.4);
          doc.strokeColor("#E2E8F0").lineWidth(0.75).moveTo(margin, doc.y).lineTo(margin + contentWidth, doc.y).stroke();
          doc.moveDown(0.4);
        }
      }

      // --- Running Headers & Footers on all buffered pages ---
      const range = doc.bufferedPageRange();
      for (let p = range.start; p < range.start + range.count; p++) {
        doc.switchToPage(p);

        // Header on pages > 0
        if (p > 0) {
          doc.font("Helvetica").fontSize(7.5).fillColor("#94A3B8");
          doc.text(
            `${options.repoName ? options.repoName + " • " : ""}Documentation`,
            margin,
            margin - 22,
            { width: contentWidth, align: "left" }
          );
          doc.strokeColor("#F1F5F9").lineWidth(0.5)
            .moveTo(margin, margin - 12)
            .lineTo(margin + contentWidth, margin - 12)
            .stroke();
        }

        // Footer Divider Rule
        doc.strokeColor("#E2E8F0").lineWidth(0.5)
          .moveTo(margin, pageHeight - margin + 8)
          .lineTo(margin + contentWidth, pageHeight - margin + 8)
          .stroke();

        // Footer Text
        doc.font("Helvetica").fontSize(8).fillColor("#94A3B8");
        doc.text(
          `CodeSphere Intelligent Analysis`,
          margin,
          pageHeight - margin + 14,
          { width: contentWidth / 2, align: "left" }
        );
        doc.text(
          `Page ${p + 1} of ${range.count}`,
          margin + contentWidth / 2,
          pageHeight - margin + 14,
          { width: contentWidth / 2, align: "right" }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function findNextInlineToken(tokens: any[], currentIndex: number): any | null {
  for (let j = currentIndex + 1; j < tokens.length; j++) {
    if (tokens[j].type === "inline") return tokens[j];
    if (tokens[j].type.endsWith("_close") && tokens[j].type !== "paragraph_close") break;
  }
  return null;
}

interface InlineOptions {
  x: number;
  width: number;
  fontSize: number;
  textColor: string;
  isItalic?: boolean;
}

function renderInlineText(doc: PDFKit.PDFDocument, token: any, opts: InlineOptions) {
  if (!token.children || token.children.length === 0) {
    const font = opts.isItalic ? "Helvetica-Oblique" : "Helvetica";
    doc.font(font).fontSize(opts.fontSize).fillColor(opts.textColor);
    doc.text(token.content, opts.x, doc.y, { width: opts.width, lineGap: 2.5 });
    return;
  }

  let isBold = false;
  let isItalic = opts.isItalic || false;

  const segments: { text: string; bold: boolean; italic: boolean; code: boolean }[] = [];

  for (const child of token.children) {
    if (child.type === "strong_open") isBold = true;
    else if (child.type === "strong_close") isBold = false;
    else if (child.type === "em_open") isItalic = true;
    else if (child.type === "em_close") isItalic = opts.isItalic || false;
    else if (child.type === "code_inline") {
      segments.push({ text: child.content, bold: false, italic: false, code: true });
    } else if (child.type === "text") {
      if (child.content) {
        segments.push({ text: child.content, bold: isBold, italic: isItalic, code: false });
      }
    }
  }

  if (segments.length === 0) {
    doc.font("Helvetica").fontSize(opts.fontSize).fillColor(opts.textColor);
    doc.text(token.content, opts.x, doc.y, { width: opts.width, lineGap: 2.5 });
    return;
  }

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    const isLast = s === segments.length - 1;

    let fontName = "Helvetica";
    if (seg.code) fontName = "Courier";
    else if (seg.bold && seg.italic) fontName = "Helvetica-BoldOblique";
    else if (seg.bold) fontName = "Helvetica-Bold";
    else if (seg.italic) fontName = "Helvetica-Oblique";

    const color = seg.code ? "#0F172A" : seg.bold ? "#0F172A" : opts.textColor;
    const fontSize = seg.code ? opts.fontSize - 0.5 : opts.fontSize;

    doc.font(fontName).fontSize(fontSize).fillColor(color);

    if (s === 0) {
      doc.text(seg.text, opts.x, doc.y, {
        continued: !isLast,
        width: opts.width,
        lineGap: 2.5,
      });
    } else {
      doc.text(seg.text, {
        continued: !isLast,
        width: opts.width,
        lineGap: 2.5,
      });
    }
  }
}

interface TableRenderOptions {
  margin: number;
  contentWidth: number;
  bottomLimit: number;
  checkPageBreak: (needed: number) => void;
}

function renderTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  opts: TableRenderOptions
) {
  const numCols = headers.length;
  if (numCols === 0) return;

  // Calculate proportional column widths
  const maxLens = headers.map((h, i) => {
    let maxLen = h.length;
    for (const r of rows) {
      if (r[i]) maxLen = Math.max(maxLen, r[i].length);
    }
    return Math.max(maxLen, 6);
  });

  const totalLen = maxLens.reduce((a, b) => a + b, 0);
  const colWidths = maxLens.map((len) => (len / totalLen) * opts.contentWidth);

  // Normalize column widths so their sum exactly equals opts.contentWidth
  const currentSum = colWidths.reduce((a, b) => a + b, 0);
  const factor = opts.contentWidth / currentSum;
  for (let i = 0; i < colWidths.length; i++) {
    colWidths[i] = colWidths[i] * factor;
  }

  const headerPadding = 6;
  const rowPadding = 5;

  // Header row height calculation
  doc.font("Helvetica-Bold").fontSize(8.5);
  const headerHeights = headers.map((h, idx) =>
    doc.heightOfString(h, { width: colWidths[idx] - 12 })
  );
  const headerRowHeight = Math.max(20, Math.max(...headerHeights) + headerPadding * 2);

  opts.checkPageBreak(headerRowHeight + 25);
  doc.moveDown(0.3);

  let curY = doc.y;

  // Draw Header Row
  doc.rect(opts.margin, curY, opts.contentWidth, headerRowHeight)
    .fillAndStroke("#F1F5F9", "#CBD5E1");

  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#1E293B");
  let colX = opts.margin;
  headers.forEach((h, idx) => {
    doc.text(h, colX + 6, curY + headerPadding, {
      width: colWidths[idx] - 12,
      lineBreak: true,
    });
    colX += colWidths[idx];
  });

  curY += headerRowHeight;

  // Draw Table Rows
  rows.forEach((row, rIdx) => {
    doc.font("Helvetica").fontSize(8);
    const cellHeights = row.map((c, idx) =>
      doc.heightOfString(c || "", { width: colWidths[idx] - 12 })
    );
    const rowHeight = Math.max(18, Math.max(...cellHeights) + rowPadding * 2);

    if (curY + rowHeight > opts.bottomLimit) {
      doc.addPage();
      curY = opts.margin + 10;

      // Re-draw header on new page for table continuity
      doc.rect(opts.margin, curY, opts.contentWidth, headerRowHeight)
        .fillAndStroke("#F1F5F9", "#CBD5E1");
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#1E293B");
      let hX = opts.margin;
      headers.forEach((h, idx) => {
        doc.text(h, hX + 6, curY + headerPadding, {
          width: colWidths[idx] - 12,
          lineBreak: true,
        });
        hX += colWidths[idx];
      });
      curY += headerRowHeight;
    }

    const bg = rIdx % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
    doc.rect(opts.margin, curY, opts.contentWidth, rowHeight)
      .fillAndStroke(bg, "#E2E8F0");

    doc.font("Helvetica").fontSize(8).fillColor("#334155");
    let cellX = opts.margin;
    row.forEach((cell, idx) => {
      // Check if cell is surrounded by backticks
      const cleanCell = cell || "";
      const isCode = cleanCell.startsWith("`") && cleanCell.endsWith("`");
      const textToDraw = isCode ? cleanCell.slice(1, -1) : cleanCell;

      if (isCode) {
        doc.font("Courier").fontSize(7.5).fillColor("#0F172A");
      } else {
        doc.font("Helvetica").fontSize(8).fillColor("#334155");
      }

      doc.text(textToDraw, cellX + 6, curY + rowPadding, {
        width: colWidths[idx] - 12,
        lineBreak: true,
      });
      cellX += colWidths[idx];
    });

    curY += rowHeight;
  });

  doc.y = curY + 6;
}
