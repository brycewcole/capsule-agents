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
} from "./ui/select.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx"
import { ItemsTable } from "./ui/items-table.tsx"
import { Badge } from "./ui/badge.tsx"
import { Info, Webhook } from "lucide-react"

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

// Body-only component (no card wrapper) for embedding inside other layouts/dialogs
export function HooksConfigBody({ hooks, onChange }: HooksConfigProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [selectedType, setSelectedType] = useState<HookType | null>(null)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const selectedOption = HOOK_TYPES.find((type) => type.value === selectedType)

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
    <>
      <ItemsTable
        items={hooks}
        columns={[
          {
            header: "Type",
            accessor: () => "Discord",
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
        addButtonLabel="Add"
        emptyMessage="No hooks configured. Add a hook to send task results to external services."
      />

      {/* Add/Edit Hook Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg gap-0 p-0">
          <div className="px-6 pt-6 pb-4">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-2xl">
                {editIndex !== null ? "Edit Hook" : "Add Hook"}
              </DialogTitle>
              <DialogDescription className="text-base">
                Configure how task results are delivered to your external
                service.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 pb-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Hook Type</Label>
                <Badge variant="secondary" className="text-[11px]">
                  Required
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Choose where task results will be sent.
              </p>
              <Select
                value={selectedType || ""}
                onValueChange={handleSelectType}
                disabled={editIndex !== null}
              >
                <SelectTrigger className="h-12 w-full justify-between">
                  <div className="flex items-center gap-3">
                    <Webhook className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold">
                      {selectedOption
                        ? selectedOption.label
                        : "Select hook type"}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {HOOK_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedType === "discord" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="webhook-url" className="text-sm font-medium">
                    Webhook URL
                  </Label>
                  <Badge variant="outline" className="text-[11px]">
                    Keep Private
                  </Badge>
                </div>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveHook()
                  }}
                  className="h-11"
                />
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4" />
                  <span>
                    From Discord: Server Settings → Integrations → Webhooks.
                    Paste the full URL from the channel you want updates in.
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              onClick={handleCloseDialog}
              className="h-10 px-4"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveHook}
              disabled={!selectedType || !webhookUrl.trim()}
              className="h-10 px-4"
            >
              {editIndex !== null ? "Save Changes" : "Add Hook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function HooksConfig({ hooks, onChange }: HooksConfigProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Output Hooks
            </CardTitle>
            <CardDescription className="mt-1 space-y-1">
              <p>
                Send task results to external services whenever a run completes.
              </p>
              <p className="text-muted-foreground">
                Hooks set here travel with this context/schedule. They layer on
                top of the agent’s defaults so you can override or specialize
                delivery for this experience without touching the global config.
              </p>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <HooksConfigBody hooks={hooks} onChange={onChange} />
      </CardContent>
    </Card>
  )
}
