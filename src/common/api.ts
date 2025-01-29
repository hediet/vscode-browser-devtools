export type DevToolsPaneApi = {
    host: {
        initialized(): void;
        handleCdpMessage(message: string): void;
    };
    client: {
        handleCdpMessage(message: unknown): void;
    };
};
