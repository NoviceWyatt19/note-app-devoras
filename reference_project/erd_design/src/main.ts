import {
  MarkdownView,
  normalizePath,
  Notice,
  Plugin,
  TFolder,
  type MarkdownPostProcessorContext,
  type WorkspaceLeaf
} from "obsidian";
import { findErdBlockAtLine, findErdBlocks, type ErdBlockRange } from "./blocks";
import {
  createEmptyErdDocument,
  createErdCodeBlock,
  ERD_CODE_BLOCK_LANGUAGE,
  parseErdDocument,
  serializeErdDocument,
  type ErdDocumentV1
} from "./erd";
import { ErdDesignerView, ERD_VIEW_TYPE, type ErdViewTarget } from "./ErdDesignerView";
import { DEFAULT_SETTINGS, ErdDesignerSettingTab, type ErdDesignerSettings } from "./settings";
import { generateErdSvg } from "./staticRenderer";

export default class ErdDesignerPlugin extends Plugin {
  settings: ErdDesignerSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(ERD_VIEW_TYPE, (leaf: WorkspaceLeaf) => new ErdDesignerView(leaf, this.settings));
    this.addSettingTab(new ErdDesignerSettingTab(this.app, this));

    this.addRibbonIcon("database", "Create new ERD", async () => {
      await this.createNewErdFile();
    });

    this.addCommand({
      id: "create-new-erd-file",
      name: "Create new ERD file",
      callback: async () => {
        await this.createNewErdFile();
      }
    });

    this.addCommand({
      id: "create-new-erd-block",
      name: "Create new ERD block",
      editorCallback: async (editor, view) => {
        if (!view.file) {
          new Notice("Open a Markdown note before creating an ERD.");
          return;
        }
        const document = createEmptyErdDocument();
        const cursor = editor.getCursor();
        const block = createErdCodeBlock(document);
        editor.replaceRange(`${block}\n`, cursor);
        const range: ErdBlockRange = {
          lineStart: cursor.line,
          lineEnd: cursor.line + block.split("\n").length - 1,
          source: serializeErdDocument(document)
        };
        await this.openDesigner({
          filePath: view.file.path,
          block: range,
          document
        });
      }
    });

    this.addCommand({
      id: "open-erd-designer",
      name: "Open ERD Designer",
      editorCallback: async (editor, view) => {
        if (!view.file) {
          new Notice("Open a Markdown note before opening an ERD.");
          return;
        }
        const markdown = editor.getValue();
        const block = findErdBlockAtLine(markdown, editor.getCursor().line);
        if (!block) {
          new Notice("Place the cursor inside an obsidian-erd code block.");
          return;
        }
        await this.openBlock(view.file.path, block);
      }
    });

    this.addCommand({
      id: "export-active-erd-svg",
      name: "Export active ERD as SVG",
      callback: () => this.exportActive("svg")
    });

    this.addCommand({
      id: "export-active-erd-png",
      name: "Export active ERD as PNG",
      callback: () => this.exportActive("png")
    });

    this.registerMarkdownCodeBlockProcessor(ERD_CODE_BLOCK_LANGUAGE, (source, el, ctx) => {
      this.renderCodeBlock(source, el, ctx);
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(ERD_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData() as Partial<ErdDesignerSettings> & { defaultCardinality?: string } | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    if (loaded?.defaultCardinality && !loaded.defaultFromCardinality && !loaded.defaultToCardinality) {
      if (loaded.defaultCardinality === "one-to-one") {
        this.settings.defaultFromCardinality = "one";
        this.settings.defaultToCardinality = "one";
      } else if (loaded.defaultCardinality === "one-to-many") {
        this.settings.defaultFromCardinality = "one";
        this.settings.defaultToCardinality = "zero-or-many";
      } else if (loaded.defaultCardinality === "many-to-many") {
        this.settings.defaultFromCardinality = "zero-or-many";
        this.settings.defaultToCardinality = "zero-or-many";
      } else {
        this.settings.defaultFromCardinality = "zero-or-many";
        this.settings.defaultToCardinality = "one";
      }
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async openDesigner(target: ErdViewTarget): Promise<void> {
    const leaf = this.findDesignerLeaf(target) ?? this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: ERD_VIEW_TYPE, active: true });
    await leaf.loadIfDeferred();
    await this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });

    const view = leaf.view;
    if (view instanceof ErdDesignerView) {
      view.setTarget(target);
    }
  }

  private findDesignerLeaf(target: ErdViewTarget): WorkspaceLeaf | null {
    return this.app.workspace.getLeavesOfType(ERD_VIEW_TYPE).find((leaf) => {
      const view = leaf.view;
      if (!(view instanceof ErdDesignerView)) return false;
      const currentTarget = view.getCurrentTarget();
      return currentTarget !== null
        && currentTarget.filePath === target.filePath
        && currentTarget.block.lineStart === target.block.lineStart;
    }) ?? null;
  }

  private async openOrCreateFromActiveFile(): Promise<void> {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = markdownView?.file;
    if (!file) {
      new Notice("Open a Markdown note before creating an ERD.");
      return;
    }

    const markdown = await this.app.vault.read(file);
    const block = findErdBlocks(markdown)[0];
    if (block) {
      await this.openBlock(file.path, block);
      return;
    }

    const document = createEmptyErdDocument();
    const nextBlock = createErdCodeBlock(document);
    const nextMarkdown = markdown.trim().length > 0
      ? `${markdown}\n\n${nextBlock}\n`
      : `${nextBlock}\n`;
    await this.app.vault.modify(file, nextMarkdown);
    const lineStart = markdown.trim().length > 0 ? markdown.split("\n").length + 1 : 0;
    await this.openDesigner({
      filePath: file.path,
      block: {
        lineStart,
        lineEnd: lineStart + nextBlock.split("\n").length - 1,
        source: serializeErdDocument(document)
      },
      document
    });
  }

  private async createNewErdFile(): Promise<void> {
    try {
      const folderPath = await this.ensureErdFolder();
      const document = createEmptyErdDocument();
      const block = createErdCodeBlock(document);
      const filePath = this.nextErdFilePath(folderPath);
      await this.app.vault.create(filePath, `${block}\n`);
      await this.openDesigner({
        filePath,
        block: {
          lineStart: 0,
          lineEnd: block.split("\n").length - 1,
          source: serializeErdDocument(document)
        },
        document
      });
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not create a new ERD file.");
    }
  }

  private async ensureErdFolder(): Promise<string> {
    const folderPath = normalizePath(this.settings.defaultErdFolder.trim() || DEFAULT_SETTINGS.defaultErdFolder);
    const existing = this.app.vault.getAbstractFileByPath(folderPath);
    if (existing instanceof TFolder) return folderPath;
    if (existing) {
      throw new Error(`Cannot create ERD folder because ${folderPath} already exists as a file.`);
    }
    await this.app.vault.createFolder(folderPath);
    return folderPath;
  }

  private nextErdFilePath(folderPath: string): string {
    const date = new Date();
    const datePart = [
      date.getFullYear(),
      `${date.getMonth() + 1}`.padStart(2, "0"),
      `${date.getDate()}`.padStart(2, "0")
    ].join("-");
    const baseName = `Untitled ERD ${datePart}`;
    let index = 0;
    while (true) {
      const suffix = index === 0 ? "" : ` ${index + 1}`;
      const path = normalizePath(`${folderPath}/${baseName}${suffix}.md`);
      if (!this.app.vault.getAbstractFileByPath(path)) return path;
      index += 1;
    }
  }

  private async openBlock(filePath: string, block: ErdBlockRange): Promise<void> {
    try {
      const document = parseErdDocument(block.source);
      await this.openDesigner({ filePath, block, document });
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not parse ERD block.");
    }
  }

  private renderCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    const wrapper = el.createDiv({ cls: "erd-reading" });
    const actions = wrapper.createDiv({ cls: "erd-reading-actions" });
    const openButton = actions.createEl("button", { text: "Open ERD Designer" });
    const body = wrapper.createDiv({ cls: "erd-reading-body" });

    let document: ErdDocumentV1;
    try {
      document = parseErdDocument(source);
      body.innerHTML = generateErdSvg(document, { fitToContent: true, padding: 24, minWidth: 320, minHeight: 180 });
    } catch (error) {
      body.createEl("pre", {
        text: error instanceof Error ? error.message : "Invalid ERD block."
      });
      return;
    }

    openButton.addEventListener("click", async () => {
      const section = ctx.getSectionInfo(el);
      if (!section) {
        new Notice("Could not locate this ERD block in the note.");
        return;
      }
      await this.openDesigner({
        filePath: ctx.sourcePath,
        block: {
          lineStart: section.lineStart,
          lineEnd: section.lineEnd,
          source
        },
        document
      });
    });
  }

  private exportActive(format: "svg" | "png"): void {
    const view = this.app.workspace.getLeavesOfType(ERD_VIEW_TYPE)
      .map((leaf) => leaf.view)
      .find((view): view is ErdDesignerView => view instanceof ErdDesignerView);
    const target = view?.getCurrentTarget();
    if (!target) {
      new Notice("Open an ERD in the designer before exporting.");
      return;
    }

    const svg = generateErdSvg(target.document);
    const filename = `${target.filePath.split("/").pop()?.replace(/\.md$/i, "") ?? "diagram"}.erd.${format}`;
    if (format === "svg") {
      const blob = new Blob([svg], { type: "image/svg+xml" });
      this.downloadBlob(filename, blob);
      return;
    }

    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        new Notice("Canvas is not available.");
        return;
      }
      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) {
          new Notice("PNG export failed.");
          return;
        }
        this.downloadBlob(filename, blob);
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      new Notice("Could not export PNG.");
    };
    image.src = url;
  }

  private downloadBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
