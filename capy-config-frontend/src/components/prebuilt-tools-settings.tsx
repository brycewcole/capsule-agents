"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Save, Loader2, Settings } from "lucide-react"
import { toast } from "sonner"
import { getPrebuiltToolsSettings, updatePrebuiltToolsSettings, type PrebuiltToolsSettings } from "@/lib/api"

export default function PrebuiltToolsSettings() {
  const [settings, setSettings] = useState<PrebuiltToolsSettings>({
    fileAccess: true,
    braveSearch: true
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalSettings, setOriginalSettings] = useState<PrebuiltToolsSettings>({
    fileAccess: true,
    braveSearch: true
  })

  const loadSettings = async () => {
    setIsLoading(true)
    try {
      const response = await getPrebuiltToolsSettings()
      setSettings(response)
      setOriginalSettings(response)
      setHasChanges(false)
    } catch (error) {
      console.error("Error loading prebuilt tools settings:", error)
      toast.error("Failed to load settings", {
        description: "Could not load prebuilt tools settings. Using defaults."
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!hasChanges) return

    setIsSaving(true)
    try {
      const updatedSettings = await updatePrebuiltToolsSettings(settings)
      setOriginalSettings(updatedSettings)
      setHasChanges(false)
      toast.success("Settings saved", {
        description: "Prebuilt tools settings have been updated successfully."
      })
    } catch (error) {
      console.error("Error saving prebuilt tools settings:", error)
      toast.error("Failed to save settings", {
        description: "Could not save prebuilt tools settings. Please try again."
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setSettings(originalSettings)
    setHasChanges(false)
  }

  const updateSetting = (key: keyof PrebuiltToolsSettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    setHasChanges(
      newSettings.fileAccess !== originalSettings.fileAccess ||
      newSettings.braveSearch !== originalSettings.braveSearch
    )
  }

  useEffect(() => {
    loadSettings()
  }, [])

  if (isLoading) {
    return (
      <Card className="shadow-md">
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading prebuilt tools settings...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <Settings className="mr-2 h-5 w-5" />
          Prebuilt Tools
        </CardTitle>
        <CardDescription>
          Configure which prebuilt tools are available to your agent
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-1">
              <Label htmlFor="file-access-toggle" className="text-sm font-medium">
                File Access
              </Label>
              <p className="text-xs text-muted-foreground">
                Allows the agent to read, write, and manage files in the workspace
              </p>
            </div>
            <Switch
              id="file-access-toggle"
              checked={settings.fileAccess}
              onCheckedChange={(checked) => updateSetting('fileAccess', checked)}
            />
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-1">
              <Label htmlFor="brave-search-toggle" className="text-sm font-medium">
                Brave Search
              </Label>
              <p className="text-xs text-muted-foreground">
                Enables web search capabilities using Brave Search API
              </p>
            </div>
            <Switch
              id="brave-search-toggle"
              checked={settings.braveSearch}
              onCheckedChange={(checked) => updateSetting('braveSearch', checked)}
            />
          </div>
        </div>

        {hasChanges && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" size="sm" onClick={handleReset}>
              Reset
            </Button>
            <Button onClick={handleSave} size="sm" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}