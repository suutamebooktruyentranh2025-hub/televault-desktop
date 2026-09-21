export function DashboardRankList({ title, columns, rows, emptyLabel }) {
  return (
    <div className="gd-dashboard-card">
      <h3 className="gd-dashboard-card-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="gd-dashboard-empty">{emptyLabel}</p>
      ) : (
        <div className="gd-dashboard-table-wrap">
          <table className="gd-dashboard-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className={col.align === 'right' ? 'text-right' : ''}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={row.onClick ? 'gd-dashboard-table-clickable' : ''}
                  onClick={row.onClick}
                  onKeyDown={
                    row.onClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            row.onClick();
                          }
                        }
                      : undefined
                  }
                  tabIndex={row.onClick ? 0 : undefined}
                  role={row.onClick ? 'button' : undefined}
                >
                  {row.cells.map((cell, i) => (
                    <td
                      key={columns[i]?.key || i}
                      className={columns[i]?.align === 'right' ? 'text-right' : ''}
                    >
                      {typeof cell === 'object' && cell !== null && 'title' in cell ? (
                        <div className="gd-dashboard-cell-with-subtext">
                          <span className="gd-dashboard-cell-title truncate" title={cell.title}>
                            {cell.title}
                          </span>
                          {cell.subtext ? (
                            <span className="gd-dashboard-cell-subtext truncate" title={cell.subtext}>
                              {cell.subtext}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
