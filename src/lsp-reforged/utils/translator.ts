export class Translator {
    private static translations: Map<string, string>;

    public static async setTranslations(translations: Map<string, string>) {
        Translator.translations = translations;
    }

    public static translate(translatable: string): string {
        const result = Translator.translations.get(translatable);
        if(result != undefined) {
            return result;
        }
        return translatable;
    }
}