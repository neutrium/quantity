type KeyValue = {
    [key: string]: string;
};
export declare class UnitTokenManager {
    private static _instance;
    private static PREFIX_MAP;
    private static UNIT_MAP;
    private static VALUES_MAP;
    private static OUTPUT_MAP;
    private constructor();
    /**
     * The static getter that controls access to the singleton instance.
     *
     * This implementation allows you to extend the Singleton class while
     * keeping just one instance of each subclass around.
     */
    static get instance(): UnitTokenManager;
    private initialize;
    get values(): {};
    getPrefixToken(val: string): (string | null);
    getUnitToken(val: string): (string | null);
    getUnit(token: string): any;
    getTokenDefaultValue(token: string): any;
    getMap(type?: 'unit' | 'prefix'): KeyValue;
}
export {};
