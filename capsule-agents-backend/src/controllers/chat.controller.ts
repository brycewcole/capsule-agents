import { Hono } from "hono"
import { ChatService } from "../services/chat.service.ts"

export function createChatController(chatService: ChatService) {
  const router = new Hono()

  router.post("/chat/create", async (c) => {
    const { userId } = await c.req.json()
    const chatId = chatService.createChat(userId || "anonymous")
    return c.json({ chatId })
  })

  router.get("/chats", (c) => {
    try {
      const chats = chatService.getChatsList()
      return c.json({ chats })
    } catch (error) {
      console.error("Error getting chat list:", error)
      return c.json({ error: "Failed to get chat list" }, 500)
    }
  })

  router.get("/chats/:contextId", (c) => {
    const contextId = c.req.param("contextId")
    try {
      const chat = chatService.getChatWithHistory(contextId)
      if (!chat) return c.json({ error: "Chat not found" }, 404)
      return c.json(chat)
    } catch (error) {
      console.error("Error getting chat history:", error)
      return c.json({ error: "Failed to get chat history" }, 500)
    }
  })

  router.delete("/chats/:contextId", (c) => {
    const contextId = c.req.param("contextId")
    try {
      const success = chatService.deleteChatById(contextId)
      if (!success) return c.json({ error: "Chat not found" }, 404)
      return c.json({ success: true })
    } catch (error) {
      console.error("Error deleting chat:", error)
      return c.json({ error: "Failed to delete chat" }, 500)
    }
  })

  router.patch("/chats/:contextId", async (c) => {
    const contextId = c.req.param("contextId")
    try {
      const body = await c.req.json()
      const success = chatService.updateChatMetadata(contextId, body)
      if (!success) return c.json({ error: "Chat not found" }, 404)
      return c.json({ success: true })
    } catch (error) {
      console.error("Error updating chat metadata:", error)
      return c.json({ error: "Failed to update chat metadata" }, 500)
    }
  })

  return router
}
