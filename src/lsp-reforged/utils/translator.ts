import fs from 'fs-extra';

export class Translator {
    private static translations: Map<string, string>;

    public static async setTranslations(langFile: string) {
        const translations = new Map<string, string>();
        const langJson: object = JSON.parse((fs.readFileSync(langFile)).toString());
        for(const k in langJson) {
            const v = langJson[k];
            translations.set(k, v);
        }
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