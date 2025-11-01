"use client"

import { useEffect, useState } from "react"
import { Button } from "./ui/button.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table.tsx"
import {
  Download,
  File,
  Folder,
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
      event.target.value = ""
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
    if (!bytes) return "-"
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Workspace Files</CardTitle>
        <div className="flex gap-2">
          <Button
            onClick={loadFiles}
            variant="outline"
            size="sm"
            disabled={isLoading}
          >
            {isLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
          <Button
            onClick={() => document.getElementById("file-upload")?.click()}
            size="sm"
            disabled={isUploading}
          >
            {isUploading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Upload className="h-4 w-4" />}
            <span className="ml-2">Upload</span>
          </Button>
          <input
            id="file-upload"
            type="file"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading
          ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )
          : files.length === 0
          ? (
            <div className="text-center py-8 text-muted-foreground">
              No files in workspace. Upload files to get started.
            </div>
          )
          : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((file) => (
                    <TableRow key={file.path}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {file.type === "directory"
                            ? <Folder className="h-4 w-4 text-blue-500" />
                            : <File className="h-4 w-4 text-gray-500" />}
                          {file.path}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{file.type}</TableCell>
                      <TableCell>{formatFileSize(file.size)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {file.type === "file" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload(file)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(file)}
                          >
                            <Trash className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
      </CardContent>
    </Card>
  )
}
