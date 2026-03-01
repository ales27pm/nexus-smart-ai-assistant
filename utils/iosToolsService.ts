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

export type IIosToolsService = {
  loadLocalNote: () => Promise<string>;
  persistLocalNote: (note: string) => Promise<void>;
  transcribeSpeechOnce: () => Promise<string>;
  upsertVectorDocument: (content: string) => Promise<void>;
  searchVectorDocuments: (
    query: string,
    limit?: number,
  ) => Promise<VectorSearchResult[]>;
  speakText: (text: string) => Promise<void>;
  openDialer: (phoneNumber: string) => Promise<void>;
  openSms: (phoneNumber: string, body: string) => Promise<void>;
  getCurrentCoordinates: () => Promise<string>;
  createCalendarEvent: () => Promise<string>;
  getPrimaryContactSummary: () => Promise<string>;
};

export const iosToolsService: IIosToolsService = {
  loadLocalNote,
  persistLocalNote,
  transcribeSpeechOnce,
  upsertVectorDocument,
  searchVectorDocuments,
  speakText,
  openDialer,
  openSms,
  getCurrentCoordinates,
  createCalendarEvent,
  getPrimaryContactSummary,
};
