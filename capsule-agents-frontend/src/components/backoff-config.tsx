"use client"

import { useState } from "react"
import { Button } from "./ui/button.tsx"
import { Input } from "./ui/input.tsx"
import { Label } from "./ui/label.tsx"
import { Switch } from "./ui/switch.tsx"
import { Badge } from "./ui/badge.tsx"
import { Plus, Trash2 } from "lucide-react"

interface BackoffConfigProps {
  enabled: boolean
  schedule?: number[]
  onEnabledChange: (enabled: boolean) => void
  onScheduleChange: (schedule: number[]) => void
}

export function BackoffConfig({
  enabled,
  schedule = [1000, 5000, 10000],
  onEnabledChange,
  onScheduleChange,
}: BackoffConfigProps) {
  const [delays, setDelays] = useState<number[]>(
    schedule.length > 0 ? schedule : [1000, 5000, 10000],
  )

  const handleAddDelay = () => {
    const newDelays = [...delays, 1000]
    setDelays(newDelays)
    onScheduleChange(newDelays)
  }

  const handleRemoveDelay = (index: number) => {
    const newDelays = delays.filter((_, i) => i !== index)
    setDelays(newDelays)
    onScheduleChange(newDelays)
  }

  const handleDelayChange = (index: number, seconds: number) => {
    const newDelays = [...delays]
    newDelays[index] = seconds * 1000 // Convert seconds to milliseconds
    setDelays(newDelays)
    onScheduleChange(newDelays)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="backoff-enabled">Enable Retry with Backoff</Label>
          <p className="text-xs text-muted-foreground">
            Automatically retry failed executions with exponential delays
          </p>
        </div>
        <Switch
          id="backoff-enabled"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {enabled && (
        <div className="space-y-3 pl-4 border-l-2 border-muted">
          <div className="space-y-2">
            <Label className="text-sm">Retry Schedule</Label>
            <p className="text-xs text-muted-foreground">
              Configure delays between retry attempts (in seconds)
            </p>
          </div>

          <div className="space-y-2">
            {delays.map((delay, index) => (
              <div key={index} className="flex items-center gap-2">
                <Badge variant="outline" className="w-20 justify-center">
                  Attempt {index + 1}
                </Badge>
                <Input
                  type="number"
                  min={1}
                  value={delay / 1000}
                  onChange={(e) =>
                    handleDelayChange(
                      index,
                      parseInt(
                        (e.target as HTMLInputElement | HTMLTextAreaElement)
                          .value,
                      ) || 1,
                    )}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">seconds</span>
                {delays.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveDelay(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {delays.length < 5 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddDelay}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Retry Attempt
            </Button>
          )}

          <div className="bg-muted p-3 rounded-lg text-xs">
            <p className="font-medium mb-1">Retry Timeline:</p>
            <p className="text-muted-foreground">
              {delays.map((delay, i) => (
                <span key={i}>
                  {i > 0 && " → "}
                  {delay / 1000}s
                </span>
              ))}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
