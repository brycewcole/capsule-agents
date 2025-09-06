"use client"

import { useMemo, useState } from "react"
import { Input } from "./ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx"
import { Badge } from "./ui/badge.tsx"
import type { Model, ProviderInfo, ProvidersResponse } from "@/lib/api.ts"
import { HelpCircle } from "lucide-react"

type ModelPickerProps = {
  providers: ProvidersResponse | null
  value: string | null | undefined
  onChange: (modelId: string) => void
  placeholder?: string
  disabled?: boolean
}

export function ModelPicker({
  providers,
  value,
  onChange,
  placeholder = "Select a model",
  disabled = false,
}: ModelPickerProps) {
  const [search, setSearch] = useState("")

  const index = useMemo(() => {
    const byId = new Map<string, { model: Model; provider: ProviderInfo }>()
    if (providers) {
      for (const p of providers.providers) {
        for (const m of p.models) byId.set(m.id, { model: m, provider: p })
      }
    }
    return byId
  }, [providers])

  const selected = value ? index.get(value) : undefined

  const grouped = useMemo(() => {
    if (!providers) return [] as Array<{ provider: ProviderInfo; models: Model[] }>
    const term = search.trim().toLowerCase()
    const filter = (m: Model) =>
      term.length === 0 ||
      m.name.toLowerCase().includes(term) ||
      m.id.toLowerCase().includes(term) ||
      (m.description || "").toLowerCase().includes(term)

    // Available first, then unavailable
    const sortedProviders = [...providers.providers].sort((a, b) => {
      if (a.available === b.available) return a.name.localeCompare(b.name)
      return a.available ? -1 : 1
    })
    const groups = sortedProviders.map((provider) => ({
      provider,
      models: (provider.models || []).filter(filter),
    }))
    // When searching, hide empty groups; when not searching, keep unavailable providers visible
    return groups.filter((g) => g.models.length > 0 || (!g.provider.available && term.length === 0))
  }, [providers, search])

  return (
    <div className="w-full">
      <Select
        value={value || ""}
        onValueChange={onChange}
        disabled={disabled || !providers}
      >
        <SelectTrigger className="w-full justify-between">
          <SelectValue
            placeholder={placeholder}
            aria-label={selected ? selected.model.name : placeholder}
          >
            {selected ? (
              <span className="flex items-center gap-2">
                <span className="truncate max-w-[16rem] md:max-w-[24rem]">
                  {selected.model.name}
                </span>
                <Badge variant="secondary" className="shrink-0">
                  {selected.provider.name}
                </Badge>
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="w-[var(--radix-select-trigger-width)]">
          <div className="p-2 sticky top-0 bg-popover z-10 border-b">
            <Input
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="Search models"
              aria-label="Search models"
            />
          </div>
          {grouped.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No models found
            </div>
          ) : null}
          {grouped.map(({ provider, models }) => {
            const isAvailable = provider.available
            const requiredVars = provider.requiredEnvVars.join(" or ")
            return (
              <SelectGroup key={provider.id}>
                <SelectLabel className={isAvailable ? undefined : "text-muted-foreground"}>
                  <span className="inline-flex items-center gap-2">
                    <span>{provider.name}</span>
                    <Badge
                      variant={isAvailable ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {isAvailable ? "Available" : "Not configured"}
                    </Badge>
                    {!isAvailable ? (
                      <span className="relative group inline-flex items-center">
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        <div className="absolute left-0 top-full mt-1 px-2 py-1 text-xs bg-gray-800 text-white rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                          <span className="opacity-80">Required:</span>
                          <span className="ml-1 font-mono">{requiredVars}</span>
                        </div>
                      </span>
                    ) : null}
                  </span>
                </SelectLabel>
                {models.length === 0 ? (
                  <SelectItem value={`__unavailable_${provider.id}`} disabled title={!isAvailable ? `Set ${requiredVars} to enable this provider` : undefined}>
                    <div className="flex items-center justify-between w-full">
                      <span className="text-muted-foreground">
                        {isAvailable ? "No models available" : "Unavailable — set required env vars"}
                      </span>
                    </div>
                  </SelectItem>
                ) : (
                  models.map((m) => (
                    <SelectItem
                      key={m.id}
                      value={m.id}
                      disabled={!isAvailable}
                      title={
                        !isAvailable
                          ? `Set ${requiredVars} to enable this provider`
                          : m.description || m.id
                      }
                    >
                      <div className="flex items-center justify-between w-full">
                        <span>{m.name}</span>
                        {!isAvailable ? (
                          <span className="text-xs text-muted-foreground ml-2">
                            Missing API key
                          </span>
                        ) : null}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectGroup>
            )
          })}
        </SelectContent>
      </Select>
      {selected?.model.description ? (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
          {selected.model.description}
        </p>
      ) : null}
    </div>
  )
}
