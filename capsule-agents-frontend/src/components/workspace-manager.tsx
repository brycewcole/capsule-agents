"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "./ui/button.tsx"
import {
  Download,
  File,
  Folder,
  Inbox,
  Loader2,
  RefreshCw,
  Trash,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import {
  deleteWorkspaceFile,
  downloadWorkspaceFile,
  fetchWorkspaceFiles,
  uploadWorkspaceFile,
  WorkspaceFile,
} from "../lib/api.ts"

export default function WorkspaceManager() {
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    loadFiles()
  }, [])

  const loadFiles = async () => {
    try {
      setIsLoading(true)
      const data = await fetchWorkspaceFiles()
      setFiles(data)
    } catch (error) {
      console.error("Failed to fetch workspace files:", error)
      toast.error("Failed to load workspace files")
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files
    if (!fileList || fileList.length === 0) return

    try {
      setIsUploading(true)

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i]
        await uploadWorkspaceFile(file)
        toast.success(`Uploaded ${file.name}`)
      }

      await loadFiles()
    } catch (error) {
      console.error("Failed to upload file:", error)
      toast.error("Failed to upload file")
    } finally {
      setIsUploading(false)
      // Reset the input so the same file can be uploaded again
      const inputEl = uploadInputRef.current
      if (inputEl) {
        inputEl.value = ""
      } else {
        event.target.value = ""
      }
    }
  }

  const handleDownload = async (file: WorkspaceFile) => {
    try {
      await downloadWorkspaceFile(file.path)
      toast.success(`Downloaded ${file.name}`)
    } catch (error) {
      console.error("Failed to download file:", error)
      toast.error("Failed to download file")
    }
  }

  const handleDelete = async (file: WorkspaceFile) => {
    if (!confirm(`Are you sure you want to delete ${file.name}?`)) {
      return
    }

    try {
      await deleteWorkspaceFile(file.path)
      toast.success(`Deleted ${file.name}`)
      await loadFiles()
    } catch (error) {
      console.error("Failed to delete file:", error)
      toast.error("Failed to delete file")
    }
  }

  const formatFileSize = (bytes?: number): string => {
    if (bytes === undefined || bytes === null) return "-"
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <section
      className="rounded-2xl border bg-white p-6 shadow-sm"
      aria-labelledby="workspace-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3
            id="workspace-heading"
            className="text-xl font-semibold text-foreground"
          >
            Workspace
          </h3>
          <p className="text-sm text-muted-foreground">
            Upload and manage files available to your agent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={loadFiles}
            disabled={isLoading}
            aria-label="Refresh workspace files"
          >
            {isLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => uploadInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading
              ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              )
              : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload files
                </>
              )}
          </Button>
        </div>
      </div>

      <input
        ref={uploadInputRef}
        id="workspace-upload"
        type="file"
        multiple
        className="sr-only"
        onChange={handleUpload}
      />

      <div className="mt-6">
        {isLoading
          ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading workspace...</span>
            </div>
          )
          : files.length === 0
          ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/50 bg-muted/40 p-8 text-center">
              <Inbox className="h-6 w-6 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  No files yet
                </p>
                <p className="text-sm text-muted-foreground">
                  Upload data, scripts, or other resources for your agent.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => uploadInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Browse files
              </Button>
            </div>
          )
          : (
            <div className="max-h-[360px] overflow-y-auto rounded-lg border">
              <ul className="divide-y">
                {files.map((file) => (
                  <li
                    key={file.path}
                    className="flex items-center justify-between gap-3 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {file.type === "directory"
                        ? <Folder className="h-5 w-5 text-blue-500" />
                        : <File className="h-5 w-5 text-muted-foreground" />}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {file.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {file.path}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-sm text-muted-foreground">
                        {formatFileSize(file.size)}
                      </span>
                      {file.type === "file" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(file)}
                          aria-label={`Download ${file.name}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(file)}
                        aria-label={`Delete ${file.name}`}
                      >
                        <Trash className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
      </div>
    </section>
  )
}
