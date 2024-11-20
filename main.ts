import { App, Plugin, PluginSettingTab, Setting, TFile, TAbstractFile, MarkdownPostProcessorContext } from "obsidian";

// 설정 인터페이스 정의
interface WikiLinkOptimizerSettings {
	optimizeWhenAliasMatchesNoteName: boolean;
	targetFileNameForShortDisplay: string;
}

// 기본 설정 값
const DEFAULT_SETTINGS: WikiLinkOptimizerSettings = {
	optimizeWhenAliasMatchesNoteName: true,
	targetFileNameForShortDisplay: "README",
};

interface WikiLink {
	fullLink: string;
	noteName: string;
	alias: string | null;
}

export default class WikiLinkOptimizerPlugin extends Plugin {
	settings: WikiLinkOptimizerSettings;

	async onload() {
		console.log("WikiLinkOptimizerPlugin loaded");

		// 설정 불러오기
		await this.loadSettings();

		// 설정 탭 추가
		this.addSettingTab(new WikiLinkOptimizerSettingTab(this.app, this));

		// 파일 저장 시점에 WikiLink 최적화 실행
		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) => {
				if (file instanceof TFile && file.extension === "md") {
					this.optimizeWikiLinks(file);
				}
			})
		);

		// Markdown 포스트 프로세서 추가 (링크 짧은 이름으로 표시)
		this.registerMarkdownPostProcessor(this.processWikiLinkDisplay.bind(this));
	}

	// Markdown 포스트 프로세서 함수 (부모 폴더 이름 표시)
	processWikiLinkDisplay(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const wikiLinks = el.querySelectorAll("a.internal-link");

		wikiLinks.forEach((link) => {
			const href = link.getAttribute("data-href");
			if (href) {
				const pathArray = href.split("/");
				if (href.endsWith(`/${this.settings.targetFileNameForShortDisplay}`)) {
					if (pathArray.length >= 2) {
						const parentFolder = pathArray[pathArray.length - 2]; // 부모 폴더 이름 추출
						link.textContent = parentFolder + "/"; // 링크 텍스트를 부모 폴더 이름으로 설정
					}
				} else {
					const fileName = pathArray[pathArray.length - 1]; // 파일 이름 추출
					link.textContent = fileName;
				}
			}
		});
	}

	// WikiLink 최적화 메서드
	async optimizeWikiLinks(file: TFile) {
		const fileContent = await this.app.vault.read(file);
		const wikiLinkSet = new Set<WikiLink>();

		let startIndex = 0;
		while (startIndex < fileContent.length) {
			const start = fileContent.indexOf("[[", startIndex);
			if (start === -1) break;

			const end = fileContent.indexOf("]]", start);
			if (end === -1) break;

			const fullLinkText = fileContent.slice(start + 2, end);
			const [path, aliasPart] = fullLinkText.split("|");
			const alias = aliasPart || null;
			const pathSegments = path.split("/");
			const noteName = pathSegments.pop() || "";

			wikiLinkSet.add({ fullLink: fullLinkText, noteName, alias });
			startIndex = end + 2;
		}

		if (wikiLinkSet.size > 0) {
			const uniqueNames = this.getUniqueFileNames();

			let newContent = fileContent;
			wikiLinkSet.forEach(({ fullLink, noteName, alias }) => {
				const shouldOptimizeAlias = this.settings.optimizeWhenAliasMatchesNoteName && (alias === null || alias === "" || alias === noteName);

				if (uniqueNames.has(noteName)) {
					const optimizedLink = shouldOptimizeAlias ? `[[${noteName}]]` : `[[${noteName}|${alias}]`;
					newContent = newContent.replace(`[[${fullLink}]]`, optimizedLink);
				}
			});

			if (newContent !== fileContent) {
				await this.app.vault.modify(file, newContent);
			}
		}
	}

	getUniqueFileNames(): Set<string> {
		const files = this.app.vault.getMarkdownFiles();
		const nameCount: Record<string, number> = {};
		const uniqueNames = new Set<string>();

		files.forEach((file) => {
			const name = file.basename;
			nameCount[name] = (nameCount[name] || 0) + 1;
		});

		for (const [name, count] of Object.entries(nameCount)) {
			if (count === 1) {
				uniqueNames.add(name);
			}
		}
		return uniqueNames;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class WikiLinkOptimizerSettingTab extends PluginSettingTab {
	plugin: WikiLinkOptimizerPlugin;

	constructor(app: App, plugin: WikiLinkOptimizerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl("h2", { text: "WikiLink Optimizer Settings" });

		new Setting(containerEl)
			.setName("Optimize when alias matches or is empty")
			.setDesc("If enabled, WikiLinks where the alias matches the note name or is empty will be optimized to omit the alias.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.optimizeWhenAliasMatchesNoteName)
				.onChange(async (value) => {
					this.plugin.settings.optimizeWhenAliasMatchesNoteName = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("File name for short display")
			.setDesc("Enter the file name to be replaced by its parent folder name in display (e.g., README)")
			.addText(text => text
				.setPlaceholder("README")
				.setValue(this.plugin.settings.targetFileNameForShortDisplay)
				.onChange(async (value) => {
					this.plugin.settings.targetFileNameForShortDisplay = value.trim();
					await this.plugin.saveSettings();
				}));
	}
}
