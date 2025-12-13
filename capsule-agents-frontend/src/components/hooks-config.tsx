"use client"

import { useState } from "react"
import { Button } from "./ui/button.tsx"
import { Input } from "./ui/input.tsx"
import { Label } from "./ui/label.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx"
import { Webhook } from "lucide-react"
import { ItemsTable } from "./ui/items-table.tsx"

export interface HookConfig {
  type: "discord"
  enabled?: boolean
  webhookUrl: string
}

interface HooksConfigProps {
  hooks: HookConfig[]
  onChange: (hooks: HookConfig[]) => void
}

type HookType = "discord"

interface HookTypeOption {
  value: HookType
  label: string
  description: string
}

const HOOK_TYPES: HookTypeOption[] = [
  {
    value: "discord",
    label: "Discord",
    description: "Send results to a Discord channel via webhook",
  },
]

export function HooksConfig({ hooks, onChange }: HooksConfigProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [selectedType, setSelectedType] = useState<HookType | null>(null)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [editIndex, setEditIndex] = useState<number | null>(null)

  const handleOpenDialog = () => {
    setEditIndex(null)
    setSelectedType(null)
    setWebhookUrl("")
    setShowDialog(true)
  }

  const handleEditHook = (index: number) => {
    const hook = hooks[index]
    setEditIndex(index)
    setSelectedType(hook.type)
    setWebhookUrl(hook.webhookUrl)
    setShowDialog(true)
  }

  const handleSelectType = (type: string) => {
    setSelectedType(type as HookType)
  }

  const handleSaveHook = () => {
    if (!selectedType || !webhookUrl.trim()) return

    const newHook: HookConfig = {
      type: selectedType,
      enabled: true,
      webhookUrl: webhookUrl.trim(),
    }

    if (editIndex !== null) {
      // Edit existing hook
      const updated = [...hooks]
      updated[editIndex] = newHook
      onChange(updated)
    } else {
      // Add new hook
      onChange([...hooks, newHook])
    }

    handleCloseDialog()
  }

  const handleRemoveHook = (index: number) => {
    onChange(hooks.filter((_, i) => i !== index))
  }

  const handleCloseDialog = () => {
    setShowDialog(false)
    setSelectedType(null)
    setWebhookUrl("")
    setEditIndex(null)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Output Hooks
            </CardTitle>
            <CardDescription className="mt-1">
              Send task results to external services when tasks complete
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ItemsTable
          items={hooks}
          columns={[
            {
              header: "Type",
              accessor: (hook) => "Discord",
            },
            {
              header: "Webhook URL",
              accessor: (hook) => hook.webhookUrl,
            },
          ]}
          getEnabled={(hook) => hook.enabled !== false}
          onAdd={handleOpenDialog}
          onEdit={handleEditHook}
          onDelete={handleRemoveHook}
          addButtonLabel="Add Hook"
          emptyMessage="No hooks configured. Add a hook to send task results to external services."
        />
      </CardContent>

      {/* Add/Edit Hook Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editIndex !== null ? "Edit Hook" : "Add Hook"}
            </DialogTitle>
            <DialogDescription>
              Configure a hook to send task results to an external service
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Hook Type</Label>
              <Select
                value={selectedType || ""}
                onValueChange={handleSelectType}
                disabled={editIndex !== null}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select hook type..." />
                </SelectTrigger>
                <SelectContent>
                  {HOOK_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <Webhook className="h-4 w-4" />
                        <div>
                          <div className="font-medium">{type.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {type.description}
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedType === "discord" && (
              <div className="space-y-2">
                <Label htmlFor="webhook-url">Webhook URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveHook()
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Get webhook URL from Discord Server Settings → Integrations →
                  Webhooks
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveHook}
              disabled={!selectedType || !webhookUrl.trim()}
            >
              {editIndex !== null ? "Save Changes" : "Add Hook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
