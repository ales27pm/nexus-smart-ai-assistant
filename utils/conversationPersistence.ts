import { saveMessages } from "@/utils/conversations";

type PersistConversationPayload = {
  conversationId: string;
  messages: any[];
  onPersistMeta: (messages: any[]) => void;
};

class ConversationPersistenceService {
  private timer: ReturnType<typeof setTimeout> | null = null;

  schedule(payload: PersistConversationPayload, delayMs = 800) {
    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      saveMessages(payload.conversationId, payload.messages);
      payload.onPersistMeta(payload.messages);
    }, delayMs);
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export const conversationPersistenceService =
  new ConversationPersistenceService();
