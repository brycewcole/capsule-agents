"use client"

import { useEffect, useState } from "react"
import { Input } from "./ui/input.tsx"
import { Label } from "./ui/label.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx"
import { Badge } from "./ui/badge.tsx"

interface CronBuilderProps {
  value: string
  onChange: (cronExpression: string) => void
}

type PresetType = "minute" | "hourly" | "daily" | "weekly" | "monthly" |
  "custom"

export function CronBuilder({ value, onChange }: CronBuilderProps) {
  const [preset, setPreset] = useState<PresetType>("daily")
  const [minuteInterval, setMinuteInterval] = useState(5)
  const [hourInterval, setHourInterval] = useState(1)
  const [hourMinute, setHourMinute] = useState(0)
  const [dailyHour, setDailyHour] = useState(9)
  const [dailyMinute, setDailyMinute] = useState(0)
  const [weeklyDay, setWeeklyDay] = useState(1) // Monday
  const [weeklyHour, setWeeklyHour] = useState(9)
  const [weeklyMinute, setWeeklyMinute] = useState(0)
  const [monthlyDay, setMonthlyDay] = useState(1)
  const [monthlyHour, setMonthlyHour] = useState(9)
  const [monthlyMinute, setMonthlyMinute] = useState(0)
  const [customExpression, setCustomExpression] = useState(value)

  useEffect(() => {
    // Initialize from existing cron expression if possible
    if (value) {
      const parts = value.split(" ")
      if (parts.length === 5) {
        // Try to detect preset
        if (value === "* * * * *") {
          setPreset("minute")
          setMinuteInterval(1)
        } else if (value.startsWith("*/")) {
          setPreset("minute")
          const interval = parseInt(parts[0].substring(2))
          if (!isNaN(interval)) setMinuteInterval(interval)
        } else if (parts[1] === "*" && parts[2] === "*" && parts[3] === "*" &&
          parts[4] === "*") {
          setPreset("hourly")
          const minute = parseInt(parts[0])
          if (!isNaN(minute)) setHourMinute(minute)
        } else if (parts[2] === "*" && parts[3] === "*" && parts[4] === "*") {
          setPreset("daily")
          const hour = parseInt(parts[1])
          const minute = parseInt(parts[0])
          if (!isNaN(hour)) setDailyHour(hour)
          if (!isNaN(minute)) setDailyMinute(minute)
        } else if (parts[2] === "*" && parts[3] === "*" && parts[4] !== "*") {
          setPreset("weekly")
          const day = parseInt(parts[4])
          const hour = parseInt(parts[1])
          const minute = parseInt(parts[0])
          if (!isNaN(day)) setWeeklyDay(day)
          if (!isNaN(hour)) setWeeklyHour(hour)
          if (!isNaN(minute)) setWeeklyMinute(minute)
        } else if (parts[2] !== "*" && parts[3] === "*" && parts[4] === "*") {
          setPreset("monthly")
          const day = parseInt(parts[2])
          const hour = parseInt(parts[1])
          const minute = parseInt(parts[0])
          if (!isNaN(day)) setMonthlyDay(day)
          if (!isNaN(hour)) setMonthlyHour(hour)
          if (!isNaN(minute)) setMonthlyMinute(minute)
        } else {
          setPreset("custom")
          setCustomExpression(value)
        }
      }
    }
  }, [])

  useEffect(() => {
    let expression = ""

    switch (preset) {
      case "minute":
        if (minuteInterval === 1) {
          expression = "* * * * *"
        } else {
          expression = `*/${minuteInterval} * * * *`
        }
        break
      case "hourly":
        if (hourInterval === 1) {
          expression = `${hourMinute} * * * *`
        } else {
          expression = `${hourMinute} */${hourInterval} * * *`
        }
        break
      case "daily":
        expression = `${dailyMinute} ${dailyHour} * * *`
        break
      case "weekly":
        expression = `${weeklyMinute} ${weeklyHour} * * ${weeklyDay}`
        break
      case "monthly":
        expression = `${monthlyMinute} ${monthlyHour} ${monthlyDay} * *`
        break
      case "custom":
        expression = customExpression
        break
    }

    if (expression !== value) {
      onChange(expression)
    }
  }, [
    preset,
    minuteInterval,
    hourInterval,
    hourMinute,
    dailyHour,
    dailyMinute,
    weeklyDay,
    weeklyHour,
    weeklyMinute,
    monthlyDay,
    monthlyHour,
    monthlyMinute,
    customExpression,
  ])

  const formatTime = (hour: number, minute: number): string => {
    const period = hour >= 12 ? "PM" : "AM"
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return `${displayHour.toString().padStart(2, "0")}:${
      minute.toString().padStart(2, "0")
    } ${period}`
  }

  const getHumanReadable = (): string => {
    switch (preset) {
      case "minute":
        return minuteInterval === 1
          ? "Every minute"
          : `Every ${minuteInterval} minutes`
      case "hourly":
        if (hourInterval === 1) {
          return `Every hour at :${hourMinute.toString().padStart(2, "0")}`
        } else {
          return `Every ${hourInterval} hours at :${
            hourMinute.toString().padStart(2, "0")
          }`
        }
      case "daily":
        return `Daily at ${formatTime(dailyHour, dailyMinute)}`
      case "weekly":
        const days = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ]
        return `Every ${days[weeklyDay]} at ${
          formatTime(weeklyHour, weeklyMinute)
        }`
      case "monthly":
        return `Monthly on day ${monthlyDay} at ${
          formatTime(monthlyHour, monthlyMinute)
        }`
      case "custom":
        return customExpression || "Custom expression"
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Schedule Type</Label>
          <Select
            value={preset}
            onValueChange={(value) => setPreset(value as PresetType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minute">Every Minute</SelectItem>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {preset === "daily" && (
          <div className="space-y-2">
            <Label htmlFor="daily-time">Time</Label>
            <Input
              type="time"
              id="daily-time"
              value={`${dailyHour.toString().padStart(2, "0")}:${
                dailyMinute.toString().padStart(2, "0")
              }`}
              onChange={(e) => {
                const [hours, minutes] = (e.target as HTMLInputElement).value
                  .split(":")
                setDailyHour(parseInt(hours) || 0)
                setDailyMinute(parseInt(minutes) || 0)
              }}
              className="bg-background"
            />
          </div>
        )}
      </div>

      {preset === "minute" && (
        <div className="space-y-2">
          <Label>Run every</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={59}
              value={minuteInterval}
              onChange={(e) =>
                setMinuteInterval(
                  parseInt(
                    (e.target as HTMLInputElement | HTMLTextAreaElement)
                      .value,
                  ) || 1,
                )}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">
              minute(s)
            </span>
          </div>
        </div>
      )}

      {preset === "hourly" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Run every</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={23}
                value={hourInterval}
                onChange={(e) =>
                  setHourInterval(
                    parseInt(
                      (e.target as HTMLInputElement | HTMLTextAreaElement)
                        .value,
                    ) || 1,
                  )}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                hour(s)
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>At minute</Label>
            <Input
              type="number"
              min={0}
              max={59}
              value={hourMinute}
              onChange={(e) =>
                setHourMinute(
                  parseInt(
                    (e.target as HTMLInputElement | HTMLTextAreaElement).value,
                  ) || 0,
                )}
              className="w-24"
            />
          </div>
        </div>
      )}

      {preset === "weekly" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Day of Week</Label>
            <Select
              value={weeklyDay.toString()}
              onValueChange={(value) => setWeeklyDay(parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Sunday</SelectItem>
                <SelectItem value="1">Monday</SelectItem>
                <SelectItem value="2">Tuesday</SelectItem>
                <SelectItem value="3">Wednesday</SelectItem>
                <SelectItem value="4">Thursday</SelectItem>
                <SelectItem value="5">Friday</SelectItem>
                <SelectItem value="6">Saturday</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="weekly-time">Time</Label>
            <Input
              type="time"
              id="weekly-time"
              value={`${weeklyHour.toString().padStart(2, "0")}:${
                weeklyMinute.toString().padStart(2, "0")
              }`}
              onChange={(e) => {
                const [hours, minutes] = (e.target as HTMLInputElement).value
                  .split(":")
                setWeeklyHour(parseInt(hours) || 0)
                setWeeklyMinute(parseInt(minutes) || 0)
              }}
              className="bg-background"
            />
          </div>
        </div>
      )}

      {preset === "monthly" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Day of Month</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={monthlyDay}
              onChange={(e) =>
                setMonthlyDay(
                  parseInt(
                    (e.target as HTMLInputElement | HTMLTextAreaElement).value,
                  ) || 1,
                )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="monthly-time">Time</Label>
            <Input
              type="time"
              id="monthly-time"
              value={`${monthlyHour.toString().padStart(2, "0")}:${
                monthlyMinute.toString().padStart(2, "0")
              }`}
              onChange={(e) => {
                const [hours, minutes] = (e.target as HTMLInputElement).value
                  .split(":")
                setMonthlyHour(parseInt(hours) || 0)
                setMonthlyMinute(parseInt(minutes) || 0)
              }}
              className="bg-background"
            />
          </div>
        </div>
      )}

      {preset === "custom" && (
        <div className="space-y-2">
          <Label>Cron Expression</Label>
          <Input
            value={customExpression}
            onChange={(e) =>
              setCustomExpression(
                (e.target as HTMLInputElement | HTMLTextAreaElement).value,
              )}
            placeholder="* * * * *"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Format: minute hour day month weekday
          </p>
        </div>
      )}

      <div className="bg-muted p-3 rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Schedule:</span>
          <Badge variant="secondary">{getHumanReadable()}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Cron:</span>
          <Badge variant="outline" className="font-mono text-xs">
            {value}
          </Badge>
        </div>
      </div>
    </div>
  )
}
