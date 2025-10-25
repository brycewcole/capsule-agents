"use client"

import { useEffect, useState } from "react"
import { Button } from "./ui/button.tsx"
import { Input } from "./ui/input.tsx"
import { Label } from "./ui/label.tsx"
import { Textarea } from "./ui/textarea.tsx"
import { Switch } from "./ui/switch.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table.tsx"
import { Badge } from "./ui/badge.tsx"
import { Clock, Edit, Loader2, Play, Plus, Trash } from "lucide-react"
import { toast } from "sonner"
import { CronBuilder } from "./cron-builder.tsx"
import { BackoffConfig } from "./backoff-config.tsx"
import {
  createSchedule,
  deleteSchedule,
  getSchedules,
  runScheduleNow,
  Schedule,
  ScheduleInput,
  toggleSchedule,
  updateSchedule,
} from "../lib/api.ts"

export default function ScheduleManager() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(
    null,
  )
  const [isSaving, setIsSaving] = useState(false)
  const [runningScheduleId, setRunningScheduleId] = useState<string | null>(
    null,
  )

  // Form state
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")
  const [cronExpression, setCronExpression] = useState("0 9 * * *")
  const [backoffEnabled, setBackoffEnabled] = useState(false)
  const [backoffSchedule, setBackoffSchedule] = useState<number[]>([
    1000,
    5000,
    10000,
  ])

  useEffect(() => {
    fetchSchedules()
  }, [])

  const fetchSchedules = async () => {
    try {
      setIsLoading(true)
      const data = await getSchedules()
      setSchedules(data)
    } catch (error) {
      console.error("Failed to fetch schedules:", error)
      toast.error("Failed to load schedules")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateNew = () => {
    setEditingSchedule(null)
    setName("")
    setPrompt("")
    setCronExpression("0 9 * * *")
    setBackoffEnabled(false)
    setBackoffSchedule([1000, 5000, 10000])
    setShowDialog(true)
  }

  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule)
    setName(schedule.name)
    setPrompt(schedule.prompt)
    setCronExpression(schedule.cronExpression)
    setBackoffEnabled(schedule.backoffEnabled)
    setBackoffSchedule(schedule.backoffSchedule || [1000, 5000, 10000])
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!name.trim() || !prompt.trim() || !cronExpression.trim()) {
      toast.error("Please fill in all required fields")
      return
    }

    setIsSaving(true)

    try {
      const input: ScheduleInput = {
        name: name.trim(),
        prompt: prompt.trim(),
        cronExpression: cronExpression.trim(),
        enabled: true,
        backoffEnabled,
        backoffSchedule: backoffEnabled ? backoffSchedule : undefined,
      }

      if (editingSchedule) {
        await updateSchedule(editingSchedule.id, input)
        toast.success("Schedule updated successfully")
      } else {
        await createSchedule(input)
        toast.success("Schedule created successfully")
      }

      setShowDialog(false)
      fetchSchedules()
    } catch (error) {
      console.error("Failed to save schedule:", error)
      toast.error(
        `Failed to ${editingSchedule ? "update" : "create"} schedule`,
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string, scheduleName: string) => {
    if (
      !confirm(`Are you sure you want to delete the schedule "${scheduleName}"?`)
    ) {
      return
    }

    try {
      await deleteSchedule(id)
      toast.success("Schedule deleted successfully")
      fetchSchedules()
    } catch (error) {
      console.error("Failed to delete schedule:", error)
      toast.error("Failed to delete schedule")
    }
  }

  const handleToggle = async (schedule: Schedule) => {
    try {
      await toggleSchedule(schedule.id, !schedule.enabled)
      toast.success(
        `Schedule ${!schedule.enabled ? "enabled" : "disabled"} successfully`,
      )
      fetchSchedules()
    } catch (error) {
      console.error("Failed to toggle schedule:", error)
      toast.error("Failed to toggle schedule")
    }
  }

  const handleRunNow = async (id: string, scheduleName: string) => {
    try {
      setRunningScheduleId(id)
      await runScheduleNow(id)
      toast.success(`Schedule "${scheduleName}" is running`)
      // Refresh to show updated run count
      setTimeout(() => fetchSchedules(), 2000)
    } catch (error) {
      console.error("Failed to run schedule:", error)
      toast.error("Failed to run schedule")
    } finally {
      setRunningScheduleId(null)
    }
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "Never"
    return new Date(timestamp).toLocaleString()
  }

  if (isLoading) {
    return (
      <Card className="shadow-md">
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading schedules...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <CardTitle>Scheduled Tasks</CardTitle>
            </div>
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" />
              Create Schedule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {schedules.length === 0
            ? (
              <div className="text-center p-8 text-muted-foreground border border-dashed rounded-lg">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No schedules yet</p>
                <p className="text-sm mb-4">
                  Create your first scheduled task to automate agent queries
                </p>
                <Button onClick={handleCreateNew} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Schedule
                </Button>
              </div>
            )
            : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Stats</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{schedule.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {schedule.prompt}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {schedule.cronExpression}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(schedule.lastRunAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Badge variant="secondary">
                            {schedule.runCount} runs
                          </Badge>
                          {schedule.failureCount > 0 && (
                            <Badge variant="destructive">
                              {schedule.failureCount} fails
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={schedule.enabled}
                          onCheckedChange={() => handleToggle(schedule)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRunNow(schedule.id, schedule.name)}
                            disabled={runningScheduleId === schedule.id}
                            title="Run now"
                          >
                            {runningScheduleId === schedule.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Play className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(schedule)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(schedule.id, schedule.name)}
                            title="Delete"
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? "Edit Schedule" : "Create Schedule"}
            </DialogTitle>
            <DialogDescription>
              Configure when and how your agent should run automatically
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-name">Name</Label>
              <Input
                id="schedule-name"
                value={name}
                onChange={(e) =>
                  setName(
                    (e.target as HTMLInputElement | HTMLTextAreaElement).value,
                  )}
                placeholder="Daily Summary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-prompt">Prompt</Label>
              <Textarea
                id="schedule-prompt"
                value={prompt}
                onChange={(e) =>
                  setPrompt(
                    (e.target as HTMLInputElement | HTMLTextAreaElement).value,
                  )}
                placeholder="What question should the agent answer?"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Schedule</Label>
              <CronBuilder value={cronExpression} onChange={setCronExpression} />
            </div>

            <BackoffConfig
              enabled={backoffEnabled}
              schedule={backoffSchedule}
              onEnabledChange={setBackoffEnabled}
              onScheduleChange={setBackoffSchedule}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving
                ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                )
                : editingSchedule
                ? "Update"
                : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
