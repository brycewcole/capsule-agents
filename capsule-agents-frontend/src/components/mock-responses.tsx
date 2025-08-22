"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card.tsx"
import { Button } from "./ui/button.tsx"
import { Input } from "./ui/input.tsx"
import { Textarea } from "./ui/textarea.tsx"
import { Label } from "./ui/label.tsx"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.tsx"
import { Plus, Save, Trash2, MessageSquareQuote } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table.tsx"
import { Badge } from "./ui/badge.tsx"

type MatchType = "exact" | "startsWith" | "contains" | "regex"

interface MockResponse {
  id: string
  matchType: MatchType
  pattern: string
  response: string
}

export default function MockResponses() {
  const [mockResponses, setMockResponses] = useState<MockResponse[]>([
    {
      id: "1",
      matchType: "exact",
      pattern: "Hello",
      response: "Hi there! How can I help you today?",
    },
    {
      id: "2",
      matchType: "startsWith",
      pattern: "What is",
      response: "I'm not sure about that specific question, but I'd be happy to help you find the answer.",
    },
  ])

  const [newMock, setNewMock] = useState<Omit<MockResponse, "id">>({
    matchType: "exact",
    pattern: "",
    response: "",
  })

  const addMockResponse = () => {
    if (!newMock.pattern || !newMock.response) return

    const newId = `mock_${Date.now()}`
    setMockResponses([...mockResponses, { ...newMock, id: newId }])
    setNewMock({
      matchType: "exact",
      pattern: "",
      response: "",
    })
  }

  const removeMockResponse = (id: string) => {
    setMockResponses(mockResponses.filter((mock) => mock.id !== id))
  }

  const saveMockResponses = () => {
    console.log("Saving mock responses:", mockResponses)
    // In a real app, this would save to a backend
  }

  const getMatchTypeLabel = (matchType: MatchType) => {
    switch (matchType) {
      case "exact":
        return "Exact Match"
      case "startsWith":
        return "Starts With"
      case "contains":
        return "Contains"
      case "regex":
        return "Regex"
      default:
        return matchType
    }
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <MessageSquareQuote className="h-5 w-5 text-primary" />
          Mock Responses
        </CardTitle>
        <CardDescription>Create predefined responses for specific user inputs</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <Label htmlFor="match-type">Match Type</Label>
            <Select
              value={newMock.matchType}
              onValueChange={(value: MatchType) => setNewMock({ ...newMock, matchType: value })}
            >
              <SelectTrigger id="match-type">
                <SelectValue placeholder="Select match type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exact">Exact Match</SelectItem>
                <SelectItem value="startsWith">Starts With</SelectItem>
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="regex">Regex</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-3">
            <Label htmlFor="pattern">Pattern</Label>
            <div className="flex gap-2">
              <Input
                id="pattern"
                placeholder="Enter text pattern to match"
                value={newMock.pattern}
                onChange={(e) => setNewMock({ ...newMock, pattern: (e.target as HTMLInputElement | HTMLTextAreaElement).value })}
              />
              <Button onClick={addMockResponse} disabled={!newMock.pattern || !newMock.response}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="response">Response</Label>
          <Textarea
            id="response"
            placeholder="Enter the response to send when pattern matches"
            value={newMock.response}
            onChange={(e) => setNewMock({ ...newMock, response: (e.target as HTMLInputElement | HTMLTextAreaElement).value })}
            className="min-h-[100px]"
          />
        </div>

        {mockResponses.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Match Type</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockResponses.map((mock) => (
                  <TableRow key={mock.id}>
                    <TableCell>
                      <Badge variant="outline">{getMatchTypeLabel(mock.matchType)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{mock.pattern}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{mock.response}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMockResponse(mock.id)}
                        className="h-8 w-8 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-end border-t p-4">
        <Button onClick={saveMockResponses} disabled={mockResponses.length === 0}>
          <Save className="mr-2 h-4 w-4" />
          Save Mocks
        </Button>
      </CardFooter>
    </Card>
  )
}
