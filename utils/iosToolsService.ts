import {
  createCalendarEvent,
  getCurrentCoordinates,
  getPrimaryContactSummary,
  loadLocalNote,
  openDialer,
  openSms,
  persistLocalNote,
  searchVectorDocuments,
  speakText,
  transcribeSpeechOnce,
  upsertVectorDocument,
  VectorSearchResult,
} from "@/utils/nativeCapabilities";

export interface IIosToolsService {
  loadLocalNote(): Promise<string>;
  persistLocalNote(note: string): Promise<void>;
  transcribeSpeechOnce(): Promise<string>;
  upsertVectorDocument(content: string): Promise<void>;
  searchVectorDocuments(
    query: string,
    limit?: number,
  ): Promise<VectorSearchResult[]>;
  speakText(text: string): Promise<void>;
  openDialer(phoneNumber: string): Promise<void>;
  openSms(phoneNumber: string, body: string): Promise<void>;
  getCurrentCoordinates(): Promise<string>;
  createCalendarEvent(): Promise<string>;
  getPrimaryContactSummary(): Promise<string>;
}

export class NativeIosToolsService implements IIosToolsService {
  async loadLocalNote(): Promise<string> {
    return loadLocalNote();
  }

  async persistLocalNote(note: string): Promise<void> {
    return persistLocalNote(note);
  }

  async transcribeSpeechOnce(): Promise<string> {
    return transcribeSpeechOnce();
  }

  async upsertVectorDocument(content: string): Promise<void> {
    return upsertVectorDocument(content);
  }

  async searchVectorDocuments(
    query: string,
    limit?: number,
  ): Promise<VectorSearchResult[]> {
    return searchVectorDocuments(query, limit);
  }

  async speakText(text: string): Promise<void> {
    return speakText(text);
  }

  async openDialer(phoneNumber: string): Promise<void> {
    return openDialer(phoneNumber);
  }

  async openSms(phoneNumber: string, body: string): Promise<void> {
    return openSms(phoneNumber, body);
  }

  async getCurrentCoordinates(): Promise<string> {
    return getCurrentCoordinates();
  }

  async createCalendarEvent(): Promise<string> {
    return createCalendarEvent();
  }

  async getPrimaryContactSummary(): Promise<string> {
    return getPrimaryContactSummary();
  }
}

export const iosToolsService: IIosToolsService = new NativeIosToolsService();
