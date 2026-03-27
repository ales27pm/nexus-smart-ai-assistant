import { saveMessages } from "@/utils/conversations";

type PersistConversationPayload<TMessage> = {
  conversationId: string;
  messages: TMessage[];
  onPersistMeta: (messages: TMessage[]) => void;
};

class ConversationPersistenceService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingPayload: PersistConversationPayload<unknown> | null = null;

  private async persistPending(): Promise<void> {
    if (!this.pendingPayload) return;

    const payload = this.pendingPayload;
    this.pendingPayload = null;

    try {
      await saveMessages(payload.conversationId, payload.messages);
      payload.onPersistMeta(payload.messages);
    } catch (error) {
      console.error(
        "[NEXUS] Failed to persist conversation messages:",
        payload.conversationId,
        error,
      );
    }
  }

  schedule<TMessage>(
    payload: PersistConversationPayload<TMessage>,
    delayMs = 800,
  ) {
    this.pendingPayload = payload as PersistConversationPayload<unknown>;

    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(async () => {
      this.timer = null;
      await this.persistPending();
    }, delayMs);
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    void this.persistPending();
  }
}

export const conversationPersistenceService =
  new ConversationPersistenceService();
