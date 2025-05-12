import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus } from "lucide-react"

interface ToolDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  toolName: string
  setToolName: (name: string) => void
  toolType: string
  setToolType: (type: string) => void
  toolSchema: string
  setToolSchema: (schema: string) => void
  editIndex: number | null
  onSubmit: () => void
  onCancel: () => void
}

export function ToolDialog({
  open,
  onOpenChange,
  toolName,
  setToolName,
  toolType,
  setToolType,
  toolSchema,
  setToolSchema,
  editIndex,
  onSubmit,
  onCancel,
}: ToolDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Tool
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editIndex !== null ? 'Edit Tool' : 'Add Tool'}</DialogTitle>
          <DialogDescription>
            {editIndex !== null
              ? 'Update the tool details below.'
              : 'Enter the details of the new tool you want to add.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tool-name" className="pb-1">Name</Label>
              <Input
                id="tool-name"
                value={toolName}
                onChange={e => setToolName(e.target.value)}
                placeholder="weather_forecast"
              />
            </div>
            <div>
              <Label htmlFor="tool-type" className="pb-1">Type</Label>
              <Input
                id="tool-type"
                value={toolType}
                onChange={e => setToolType(e.target.value)}
                placeholder="function"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="tool-schema" className="pb-1">Schema (JSON)</Label>
            <Textarea
              id="tool-schema"
              value={toolSchema}
              onChange={e => setToolSchema(e.target.value)}
              placeholder='{"properties":{"location":{"type":"string"},"days":{"type":"number"}},"required":["location"]}'
              rows={5}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!toolName || !toolType}>
            {editIndex !== null ? 'Update Tool' : 'Add Tool'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
