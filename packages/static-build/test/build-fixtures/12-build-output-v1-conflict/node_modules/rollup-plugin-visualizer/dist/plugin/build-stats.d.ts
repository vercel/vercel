import { VisualizerData } from "../types/types";
import { TemplateType } from "./template-types";
interface BuildHtmlOptions {
    title: string;
    data: VisualizerData;
    template: TemplateType;
}
export declare function buildHtml({ title, data, template }: BuildHtmlOptions): Promise<string>;
export {};
