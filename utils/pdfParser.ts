
import * as pdfjsLib from 'pdfjs-dist';

// Define the worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

// Keywords to filter for (as per user request)
const TARGET_KEYWORDS = [
    "TRANSFERÊNCIA A CRÉDITO VIA PIX - BANCO INTER",
    "TED RECEBIDA - DECOLAR.COM",
    "TED RECEBIDA - BOOKING.COM",
    "TRANSFERÊNCIA A CRÉDITO VIA PIX - BOOKING.COM",
    "PIX RECEBIDO DE BANCO INTER SA",
    "TED RECEBIDA DE BOOKING.COM BRASIL SERVICOS DE"
];

export const extractDataFromPDF = async (file: File): Promise<any[][]> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        const extractedRows: any[][] = [];
        const seenTransactions = new Set<string>();

        // Header row for the output (matches expected format for "Extrato" tab)
        extractedRows.push(['Data', 'Descrição', 'Valor']);

        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const items = textContent.items as any[];

            // 1. Group text items by Y coordinate (Row detection)
            // PDF coordinates: Y starts from bottom. We sort descending Y to read top-to-bottom.
            const rows: { y: number, items: any[] }[] = [];
            const TOLERANCE = 5; // Vertical tolerance in pixels to consider items on same line

            // Sort items by Y descending
            items.sort((a, b) => b.transform[5] - a.transform[5]);

            for (const item of items) {
                if (!item.str || item.str.trim() === '') continue;

                const y = item.transform[5];
                const existingRow = rows.find(r => Math.abs(r.y - y) <= TOLERANCE);

                if (existingRow) {
                    existingRow.items.push(item);
                } else {
                    rows.push({ y, items: [item] });
                }
            }

            // 2. Process each row
            for (const row of rows) {
                // Sort items in row by X ascending (Left to right)
                row.items.sort((a, b) => a.transform[4] - b.transform[4]);
                
                // Join with single space and normalize
                const rowText = row.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim();
                const upperRowText = rowText.toUpperCase();

                // 3. Filter by keywords
                let matchedKeyword: string | undefined = TARGET_KEYWORDS.find(k => upperRowText.includes(k));
                
                // Map specific variations to standard names
                if (matchedKeyword === "PIX RECEBIDO DE BANCO INTER SA") {
                    matchedKeyword = "TRANSFERÊNCIA A CRÉDITO VIA PIX - BANCO INTER";
                } else if (matchedKeyword === "TED RECEBIDA DE BOOKING.COM BRASIL SERVICOS DE") {
                    matchedKeyword = "TED RECEBIDA - BOOKING.COM";
                }
                
                // Fallback for partial matches or specific combinations if the exact long string isn't found
                if (!matchedKeyword) {
                    if (upperRowText.includes("PIX RECEBIDO DE BANCO INTER SA") || (upperRowText.includes("BANCO INTER") && upperRowText.includes("PIX"))) {
                        matchedKeyword = "TRANSFERÊNCIA A CRÉDITO VIA PIX - BANCO INTER";
                    }
                    else if (upperRowText.includes("TED RECEBIDA DE BOOKING.COM BRASIL SERVICOS DE") || (upperRowText.includes("BOOKING") && upperRowText.includes("TED"))) {
                        matchedKeyword = "TED RECEBIDA - BOOKING.COM";
                    }
                    // Check specifically for the variation "BOOKING COM" (no dot) which is common in some bank statements
                    else if (upperRowText.includes("BOOKING COM") && upperRowText.includes("PIX")) {
                         matchedKeyword = "TRANSFERÊNCIA A CRÉDITO VIA PIX - BOOKING.COM";
                    }
                    else if (upperRowText.includes("DECOLAR") && (upperRowText.includes("TED") || upperRowText.includes("CREDITO"))) {
                        matchedKeyword = "TED RECEBIDA - DECOLAR.COM";
                    }
                    // General loose check for Booking PIX
                    else if (upperRowText.includes("BOOKING") && upperRowText.includes("PIX")) {
                         matchedKeyword = "TRANSFERÊNCIA A CRÉDITO VIA PIX - BOOKING.COM";
                    }
                }

                if (matchedKeyword) {
                    // 4. Extraction Logic
                    // Expected structure: Date ... Description ... Value ... Balance
                    
                    // A. Extract Date (First item usually)
                    // Matches DD/MM/YYYY
                    const dateMatch = rowText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                    const dateStr = dateMatch ? dateMatch[0] : null;

                    if (!dateStr) continue; // Skip if no valid date found

                    // B. Extract Value (Credit)
                    // Logic: The row contains Date, Desc, Credit, [Balance].
                    // We look for numeric strings at the end of the row.
                    
                    // Regex for Brazilian currency format: -1.234,56 or 1234,56 (optional C/D at end)
                    // We'll find all matches in the row
                    const currencyMatches = rowText.match(/-?[\d.]*,\d{2}[CD]?/g);

                    let valueStr = '';

                    if (currencyMatches && currencyMatches.length > 0) {
                        if (currencyMatches.length >= 2) {
                            // If 2+ numbers found (e.g. Credit and Balance), Credit is typically the one before the last (Balance)
                            valueStr = currencyMatches[currencyMatches.length - 2];
                        } else {
                            // If only 1 number found, assume it is the Value
                            valueStr = currencyMatches[0];
                        }
                    }

                    if (dateStr && valueStr) {
                        // If the value is negative (starts with - or ends with D), skip it (we only want deposits)
                        if (valueStr.startsWith('-') || valueStr.endsWith('D')) {
                            continue;
                        }

                        // Clean value string (remove 'C' or 'D' if present)
                        valueStr = valueStr.replace(/[CD]/g, '').trim();
                        
                        // Parse Date to ISO Format (YYYY-MM-DD)
                        const [day, month, year] = dateStr.split('/');
                        const isoDate = `${year}-${month}-${day}`;

                        // Parse Value to Number
                        // 1.000,00 -> 1000.00 (Remove dots, replace comma with dot)
                        const numericValue = parseFloat(valueStr.replace(/\./g, '').replace(',', '.'));

                        if (!isNaN(numericValue)) {
                            // Check for duplicates
                            const uniqueKey = `${isoDate}|${matchedKeyword}|${numericValue}`;
                            
                            if (!seenTransactions.has(uniqueKey)) {
                                seenTransactions.add(uniqueKey);
                                extractedRows.push([isoDate, matchedKeyword, numericValue]);
                            }
                        }
                    }
                }
            }
        }

        return extractedRows;

    } catch (error) {
        console.error("Error parsing PDF:", error);
        throw new Error("Falha ao processar o arquivo PDF. Verifique se é um extrato válido.");
    }
};
