declare const XLSX: any;

export const extractDataFromExcelStatement = async (file: File): Promise<any[][]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const sheetAsArray: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                
                const extractedRows: any[][] = [];
                extractedRows.push(['Data', 'Descrição', 'Valor']);
                
                // Find header row indices
                let headerRowIndex = -1;
                let dateColIndex = -1;
                let descColIndex = -1;
                let entradasSaidasColIndex = -1;
                let valueColIndex = -1;
                
                for (let i = 0; i < sheetAsArray.length; i++) {
                    const row = sheetAsArray[i];
                    for (let j = 0; j < row.length; j++) {
                        const cellValue = String(row[j]).toLowerCase().trim();
                        if (cellValue.includes('data')) dateColIndex = j;
                        if (cellValue.includes('descrição do lançamento') || cellValue.includes('historico') || cellValue.includes('descrição')) descColIndex = j;
                        if (cellValue.includes('entradas / saídas (r$)') || cellValue.includes('entradas / saídas') || cellValue.includes('entradas/saídas')) entradasSaidasColIndex = j;
                        if (cellValue.includes('valor (r$)') || cellValue === 'valor') valueColIndex = j;
                    }
                    if (dateColIndex !== -1 && descColIndex !== -1) {
                        headerRowIndex = i;
                        break;
                    }
                }
                
                if (headerRowIndex === -1) {
                    throw new Error("Não foi possível encontrar o cabeçalho do extrato (Data, Descrição).");
                }
                
                const seenTransactions = new Set<string>();
                
                for (let i = headerRowIndex + 1; i < sheetAsArray.length; i++) {
                    const row = sheetAsArray[i];
                    if (!row || row.length === 0) continue;
                    
                    const dateVal = row[dateColIndex];
                    const descVal = String(row[descColIndex] || '').trim();
                    
                    if (!dateVal || !descVal) continue;
                    
                    let isoDate = '';
                    if (dateVal instanceof Date) {
                        isoDate = dateVal.toISOString().split('T')[0];
                    } else {
                        // Try to parse DD/MM/YYYY
                        const dateMatch = String(dateVal).match(/(\d{2})\/(\d{2})\/(\d{4})/);
                        if (dateMatch) {
                            isoDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
                        } else {
                            // Try YYYY-MM-DD
                            const isoMatch = String(dateVal).match(/(\d{4})-(\d{2})-(\d{2})/);
                            if (isoMatch) {
                                isoDate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
                            }
                        }
                    }
                    
                    if (!isoDate) continue;
                    
                    const upperDesc = descVal.toUpperCase();
                    
                    let matchedKeyword = '';
                    
                    if (upperDesc.includes("PIX RECEBIDO DE BANCO INTER SA")) {
                        matchedKeyword = "TRANSFERÊNCIA A CRÉDITO VIA PIX - BANCO INTER";
                    } else if (upperDesc.includes("TRANSFERÊNCIA A CRÉDITO VIA PIX - BANCO INTER")) {
                        matchedKeyword = "TRANSFERÊNCIA A CRÉDITO VIA PIX - BANCO INTER";
                    } else if (upperDesc.includes("TED RECEBIDA - DECOLAR.COM")) {
                        matchedKeyword = "TED RECEBIDA - DECOLAR.COM";
                    } else if (upperDesc.includes("TED RECEBIDA - BOOKING.COM")) {
                        matchedKeyword = "TED RECEBIDA - BOOKING.COM";
                    } else if (upperDesc.includes("TRANSFERÊNCIA A CRÉDITO VIA PIX - BOOKING.COM")) {
                        matchedKeyword = "TRANSFERÊNCIA A CRÉDITO VIA PIX - BOOKING.COM";
                    } else if (upperDesc.includes("BOOKING COM") && upperDesc.includes("PIX")) {
                        matchedKeyword = "TRANSFERÊNCIA A CRÉDITO VIA PIX - BOOKING.COM";
                    } else if (upperDesc.includes("DECOLAR") && (upperDesc.includes("TED") || upperDesc.includes("CREDITO"))) {
                        matchedKeyword = "TED RECEBIDA - DECOLAR.COM";
                    } else if (upperDesc.includes("BOOKING") && upperDesc.includes("PIX")) {
                        matchedKeyword = "TRANSFERÊNCIA A CRÉDITO VIA PIX - BOOKING.COM";
                    } else if (upperDesc.includes("BOOKING") && upperDesc.includes("TED")) {
                        matchedKeyword = "TED RECEBIDA - BOOKING.COM";
                    }
                    
                    if (matchedKeyword) {
                        let numericValue = 0;
                        
                        // User requested: "para pagamentos na plataforma airbnb, o valor deve ser retirado da coluna 'Entradas / Saídas (R$)'"
                        // "Pix recebido de BANCO INTER SA" is for Airbnb.
                        if (matchedKeyword === "TRANSFERÊNCIA A CRÉDITO VIA PIX - BANCO INTER" && entradasSaidasColIndex !== -1) {
                            const val = row[entradasSaidasColIndex];
                            if (typeof val === 'number') {
                                numericValue = val;
                            } else {
                                const parsed = parseFloat(String(val).replace(/\./g, '').replace(',', '.'));
                                if (!isNaN(parsed)) numericValue = parsed;
                            }
                        } else {
                            // For others, try value column
                            if (valueColIndex !== -1) {
                                const val = row[valueColIndex];
                                if (typeof val === 'number') {
                                    numericValue = val;
                                } else {
                                    const parsed = parseFloat(String(val).replace(/\./g, '').replace(',', '.'));
                                    if (!isNaN(parsed)) numericValue = parsed;
                                }
                            }
                        }
                        
                        if (numericValue > 0) {
                            const uniqueKey = `${isoDate}|${matchedKeyword}|${numericValue}`;
                            if (!seenTransactions.has(uniqueKey)) {
                                seenTransactions.add(uniqueKey);
                                extractedRows.push([isoDate, matchedKeyword, numericValue]);
                            }
                        }
                    }
                }
                
                resolve(extractedRows);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsBinaryString(file);
    });
};
