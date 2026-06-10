'use client'

import React, { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Search } from 'lucide-react'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Card } from './ui/card'

export interface TableColumn<T> {
  key: keyof T
  label: string
  sortable?: boolean
  render?: (value: any, row: T) => React.ReactNode
  width?: string
}

export interface AdvancedTableProps<T extends { id: string | number }> {
  columns: TableColumn<T>[]
  data: T[]
  searchable?: boolean
  sortable?: boolean
  pageSize?: number
  onRowClick?: (row: T) => void
}

type SortDirection = 'asc' | 'desc' | null

export const AdvancedTable = React.forwardRef<HTMLDivElement, AdvancedTableProps<any>>(
  (
    {
      columns,
      data,
      searchable = true,
      sortable = true,
      pageSize = 10,
      onRowClick,
    },
    ref
  ) => {
    const [searchTerm, setSearchTerm] = useState('')
    const [sortKey, setSortKey] = useState<string | null>(null)
    const [sortDirection, setSortDirection] = useState<SortDirection>(null)
    const [currentPage, setCurrentPage] = useState(0)

    // Filter data based on search
    const filteredData = useMemo(() => {
      if (!searchTerm) return data

      const searchLower = searchTerm.toLowerCase()
      return data.filter(row =>
        columns.some(col => {
          const value = row[col.key]
          return String(value).toLowerCase().includes(searchLower)
        })
      )
    }, [data, searchTerm, columns])

    // Sort data
    const sortedData = useMemo(() => {
      if (!sortKey || !sortDirection) return filteredData

      const sorted = [...filteredData].sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
        return 0
      })

      return sorted
    }, [filteredData, sortKey, sortDirection])

    // Paginate data
    const paginatedData = useMemo(() => {
      const start = currentPage * pageSize
      return sortedData.slice(start, start + pageSize)
    }, [sortedData, currentPage, pageSize])

    const totalPages = Math.ceil(sortedData.length / pageSize)

    const handleSort = (key: string) => {
      if (!sortable) return

      if (sortKey === key) {
        if (sortDirection === 'asc') {
          setSortDirection('desc')
        } else if (sortDirection === 'desc') {
          setSortKey(null)
          setSortDirection(null)
        }
      } else {
        setSortKey(key)
        setSortDirection('asc')
      }
      setCurrentPage(0)
    }

    const getSortIcon = (key: string) => {
      if (sortKey !== key) return <ChevronsUpDown className="w-4 h-4 opacity-50" />
      return sortDirection === 'asc' ? (
        <ChevronUp className="w-4 h-4" />
      ) : (
        <ChevronDown className="w-4 h-4" />
      )
    }

    return (
      <div ref={ref} className="space-y-4">
        {/* Search Bar */}
        {searchable && (
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search table..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value)
                setCurrentPage(0)
              }}
              className="max-w-sm"
            />
            <span className="text-sm text-muted-foreground ml-auto">
              {filteredData.length} results
            </span>
          </div>
        )}

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {columns.map(col => (
                    <th
                      key={String(col.key)}
                      className={`px-4 py-3 text-left font-medium ${
                        col.width ? `w-${col.width}` : ''
                      } ${col.sortable !== false && sortable ? 'cursor-pointer hover:bg-muted' : ''}`}
                      onClick={() => col.sortable !== false && sortable && handleSort(String(col.key))}
                    >
                      <div className="flex items-center gap-2">
                        {col.label}
                        {col.sortable !== false && sortable && getSortIcon(String(col.key))}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                      No data to display
                    </td>
                  </tr>
                ) : (
                  paginatedData.map(row => (
                    <tr
                      key={row.id}
                      className={`border-b border-border/50 last:border-0 transition-colors ${
                        onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''
                      }`}
                      onClick={() => onRowClick?.(row)}
                    >
                      {columns.map(col => (
                        <td key={`${row.id}-${String(col.key)}`} className="px-4 py-3">
                          {col.render ? col.render(row[col.key], row) : String(row[col.key])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Page {currentPage + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }
)

AdvancedTable.displayName = 'AdvancedTable'
