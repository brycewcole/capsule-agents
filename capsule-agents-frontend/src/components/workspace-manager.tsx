"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "./ui/button.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible.tsx"
import {
  ChevronDown,
  ChevronRight,
  Download,
  File,
  FolderOpen,
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

interface FileTreeNode {
  name: string
  path: string
  type: "file" | "directory"
  size?: number
  children?: FileTreeNode[]
}

function buildFileTree(files: WorkspaceFile[]): FileTreeNode[] {
  const root: { [key: string]: FileTreeNode } = {}

  // Sort files to ensure directories come before their contents
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path))

  for (const file of sortedFiles) {
    const parts = file.path.split("/")
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const currentPath = parts.slice(0, i + 1).join("/")

      if (!current[part]) {
        current[part] = {
          name: part,
          path: currentPath,
          type: isLast ? file.type : "directory",
          size: isLast ? file.size : undefined,
          children: {},
        }
      }

      if (!isLast) {
        current = current[part].children as any
      }
    }
  }

  // Convert to array and sort (directories first, then alphabetically)
  function convertToArray(obj: { [key: string]: FileTreeNode }): FileTreeNode[] {
    return Object.values(obj)
      .map((node) => ({
        ...node,
        children: node.children ? convertToArray(node.children as any) : undefined,
      }))
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
  }

  return convertToArray(root)
}

interface FileTreeItemProps {
  node: FileTreeNode
  onDownload: (path: string) => void
  onDelete: (path: string, name: string) => void
  level: number
}

function FileTreeItem(
  { node, onDownload, onDelete, level }: FileTreeItemProps,
) {
  const [isOpen, setIsOpen] = useState(false)

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return "-"
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (node.type === "directory") {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent rounded-sm group"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1 flex-1 text-left">
              {isOpen
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <Folder className="h-4 w-4 text-blue-500" />
              <span className="font-medium">{node.name}</span>
            </button>
          </CollapsibleTrigger>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(node.path, node.name)
              }}
            >
              <Trash className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        </div>
        <CollapsibleContent>
          {node.children?.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              onDownload={onDownload}
              onDelete={onDelete}
              level={level + 1}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    )
  }

  return (
    <div
      className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent rounded-sm group"
      style={{ paddingLeft: `${level * 12 + 8}px` }}
    >
      <File className="h-4 w-4 text-gray-500 ml-5" />
      <span className="flex-1">{node.name}</span>
      <span className="text-xs text-muted-foreground">
        {formatFileSize(node.size)}
      </span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onDownload(node.path)}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onDelete(node.path, node.name)}
        >
          <Trash className="h-3.5 w-3.5 text-red-500" />
        </Button>
      </div>
    </div>
  )
}

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

  const handleDownload = async (path: string) => {
    try {
      await downloadWorkspaceFile(path)
      toast.success(`Downloaded ${path.split("/").pop()}`)
    } catch (error) {
      console.error("Failed to download file:", error)
      toast.error("Failed to download file")
    }
  }

  const handleDelete = async (path: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) {
      return
    }

    try {
      await deleteWorkspaceFile(path)
      toast.success(`Deleted ${name}`)
      await loadFiles()
    } catch (error) {
      console.error("Failed to delete file:", error)
      toast.error("Failed to delete file")
    }
  }

  const fileTree = buildFileTree(files)

  return (
    <section
      className="rounded-2xl border bg-white p-6 shadow-sm"
      aria-labelledby="workspace-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            <h3
              id="workspace-heading"
              className="text-xl font-semibold text-foreground"
            >
              Workspace
            </h3>
          </div>
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
              <div className="p-2">
                {fileTree.map((node) => (
                  <FileTreeItem
                    key={node.path}
                    node={node}
                    onDownload={handleDownload}
                    onDelete={handleDelete}
                    level={0}
                  />
                ))}
              </div>
            </div>
          )}
      </div>
    </section>
  )
}
