import { MessageRepository } from "../repositories/message.repository.ts"
import { TaskRepository } from "../repositories/task.repository.ts"
import { VercelService } from "./vercel.service.ts"

export class ContextService {
  constructor(
    private messageRepository: MessageRepository,
    private taskRepository: TaskRepository,
    private vercelService: VercelService,
  ) {}
}
