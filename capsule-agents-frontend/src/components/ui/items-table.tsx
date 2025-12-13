"use client"

import { Button } from "./button.tsx"
import { Edit, Plus, Trash } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table.tsx"

export interface TableColumn<T> {
  header: string
  accessor: (item: T) => React.ReactNode
  className?: string
}

export interface ItemsTableProps<T> {
  items: T[]
  columns: TableColumn<T>[]
  onAdd?: () => void
  onEdit?: (index: number) => void
  onDelete?: (index: number) => void
  addButtonLabel?: string
  emptyMessage?: string
  getEnabled?: (item: T) => boolean
}

export function ItemsTable<T>({
  items,
  columns,
  onAdd,
  onEdit,
  onDelete,
  addButtonLabel = "Add Item",
  emptyMessage = "No items configured",
  getEnabled,
}: ItemsTableProps<T>) {
  const hasStatusColumn = getEnabled !== undefined
  const hasActions = onEdit !== undefined || onDelete !== undefined

  return (
    <div className="space-y-4">
      {items.length > 0
        ? (
          <div className="space-y-2">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col, idx) => (
                    <TableHead key={idx} className={col.className}>
                      {col.header}
                    </TableHead>
                  ))}
                  {hasStatusColumn && <TableHead>Status</TableHead>}
                  {hasActions && (
                    <TableHead className="w-20">
                      Actions
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={index}>
                    {columns.map((col, colIdx) => (
                      <TableCell key={colIdx} className={col.className}>
                        <div className="max-w-xs truncate">
                          {col.accessor(item)}
                        </div>
                      </TableCell>
                    ))}
                    {hasStatusColumn && (
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            getEnabled(item)
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {getEnabled(item) ? "Enabled" : "Disabled"}
                        </span>
                      </TableCell>
                    )}
                    {hasActions && (
                      <TableCell className="flex gap-1">
                        {onEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(index)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {onDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(index)}
                            title="Delete"
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
        : (
          <p className="text-sm text-muted-foreground text-center py-8">
            {emptyMessage}
          </p>
        )}

      {onAdd && (
        <Button onClick={onAdd} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          {addButtonLabel}
        </Button>
      )}
    </div>
  )
}
