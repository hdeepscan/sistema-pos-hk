import { useState, useMemo } from "react";

interface PaginationProps {
  items: any[];
  renderTable: (pageItems: any[]) => React.ReactNode;
  itemsPerPageOptions?: number[];
}

const paginationStyles = `
  .pagination-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .pagination-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    flex-wrap: wrap;
    gap: 12px;
  }

  .pagination-info {
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .pagination-selector {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pagination-selector label {
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 500;
    margin: 0;
  }

  .pagination-selector select {
    padding: 8px 12px;
    border: 1px solid var(--border-light);
    border-radius: 6px;
    font-size: 13px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .pagination-selector select:hover {
    border-color: var(--border);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .pagination-selector select:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
  }

  .pagination-nav {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .pagination-btn {
    padding: 8px 12px;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text);
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
  }

  .pagination-btn:hover:not(:disabled) {
    border-color: var(--brand);
    background: var(--brand-light);
    color: var(--brand);
  }

  .pagination-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: var(--text-muted);
  }

  .pagination-btn.active {
    background: var(--brand);
    color: white;
    border-color: var(--brand);
  }

  .pagination-pages {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .pagination-pages span {
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 500;
  }
`;

export function Pagination({ items, renderTable, itemsPerPageOptions = [10, 25, 50] }: PaginationProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(itemsPerPageOptions[0] || 10);

  const totalPages = Math.ceil(items.length / itemsPerPage);
  const startIndex = pageIndex * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageItems = items.slice(startIndex, endIndex);

  const handlePrevious = () => {
    setPageIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleNext = () => {
    setPageIndex((prev) => Math.min(prev + 1, totalPages - 1));
  };

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(Number(e.target.value));
    setPageIndex(0); // Reset to first page
  };

  return (
    <>
      <style>{paginationStyles}</style>
      <div className="pagination-container">
        {renderTable(pageItems)}

        {items.length > 0 && (
          <div className="pagination-controls">
            <div className="pagination-info">
              Mostrando {items.length === 0 ? 0 : startIndex + 1} a {Math.min(endIndex, items.length)} de {items.length} registros
            </div>

            <div className="pagination-selector">
              <label htmlFor="items-per-page">Mostrar:</label>
              <select id="items-per-page" value={itemsPerPage} onChange={handleItemsPerPageChange}>
                {itemsPerPageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="pagination-nav">
              <button className="pagination-btn" onClick={handlePrevious} disabled={pageIndex === 0} title="Página anterior">
                ← Anterior
              </button>

              <div className="pagination-pages">
                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  let page = i;
                  if (totalPages > 5) {
                    if (pageIndex < 3) {
                      page = i;
                    } else if (pageIndex >= totalPages - 3) {
                      page = totalPages - 5 + i;
                    } else {
                      page = pageIndex - 2 + i;
                    }
                  }

                  return (
                    <button
                      key={page}
                      className={`pagination-btn ${pageIndex === page ? "active" : ""}`}
                      onClick={() => setPageIndex(page)}
                      title={`Página ${page + 1}`}
                    >
                      {page + 1}
                    </button>
                  );
                })}
                {totalPages > 5 && pageIndex < totalPages - 3 && (
                  <>
                    <span>...</span>
                    <button
                      className="pagination-btn"
                      onClick={() => setPageIndex(totalPages - 1)}
                      title={`Página ${totalPages}`}
                    >
                      {totalPages}
                    </button>
                  </>
                )}
              </div>

              <button className="pagination-btn" onClick={handleNext} disabled={pageIndex === totalPages - 1} title="Página siguiente">
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
