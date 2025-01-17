(() => {
	const {
		plugins: { removePlugin },
		solid: { createSignal },
		solidH: { html },
		ui: { Text, LinkButton, Divider, Button, ButtonColors, showToast, Header, HeaderTags, SwitchItem, Space },
	} = shelter;

	const {
		settings: { registerSection },
	} = shelter.plugin.scoped;

	// deal with this plugin still existing after sheltupdate is gone!
	if (!window.SheltupdateNative) {
		const id = shelter.plugin.id;
		setTimeout(() => removePlugin(id), 50);
		return; // don't init or anything
	}

	const [branchMetaRaw, setBranchMetaRaw] = createSignal();
	const [branchMetaGrouped, setBranchMetaGrouped] = createSignal();
	const [currentBranches, setCurrentBranches] = createSignal();

	// just because i don't trust myself, keep a copy of the branch before uninstalling sheltupdate.
	const [uninstallCache, setUninstallCache] = createSignal();

	const [vencordOtherwiseLoaded, setVencordOtherwiseLoaded] = createSignal(false);
	const [equicordOtherwiseLoaded, setEquicordOtherwiseLoaded] = createSignal(false);
	const [bdOtherwiseLoaded, setBdOtherwiseLoaded] = createSignal(false);

	const updateCurrent = () => SheltupdateNative.getCurrentBranches().then(setCurrentBranches);
	updateCurrent().then(() => {
		if (window.Vencord) {
			if (!currentBranches().includes("vencord")) setVencordOtherwiseLoaded(true);
			if (!currentBranches().includes("equicord")) setEquicordOtherwiseLoaded(true);
		}

		if (window.BdApi && !currentBranches().includes("betterdiscord")) setBdOtherwiseLoaded(true);
	});

	SheltupdateNative.getAllowedBranches().then((branches) => {
		// group by type, conveniently "mod" is before "tool" alphabetically
		const grouped = {};
		for (const branchName in branches) {
			const data = branches[branchName];
			if (!grouped[data.type]) grouped[data.type] = {};

			grouped[data.type][branchName] = data;
		}

		setBranchMetaGrouped(grouped);
		setBranchMetaRaw(branches);
	});

	const prettyModNames = (branches) => {
		const modNames = [
			"shelter",
			...branches()
				.filter((b) => b !== "shelter")
				.map((b) => branchMetaRaw()[b].name),
		];

		if (modNames.length === 1) return modNames[0];
		if (modNames.length === 2) return modNames.join(" and ");
		const lastMod = modNames.pop();
		return modNames.join(", ") + ", and " + lastMod;
	};

	// ok so this will display *above* the shelter heading which is not ideal but its okay i guess
	registerSection("divider");
	registerSection("header", "Sheltupdate");
	registerSection("section", "sheltupdate", "Client Mods", SettingsView);

	function BranchEntry(props /*: { name, data, value, onChange } */) {
		// note: if shelter is disabled (i.e. you uninstalled sheltupdate), allow switching back on
		const disabled = () =>
			props.name === "shelter" && props.value
				? "You need shelter to have access to this menu. Try uninstalling sheltupdate."
				: props.name === "vencord" && vencordOtherwiseLoaded()
					? "Vencord is currently loaded by some other mechanism."
					: props.name === "equicord" && equicordOtherwiseLoaded()
						? "Equicord is currently loaded by some other mechanism, or Vencord is loaded."
						: props.name === "betterdiscord" && bdOtherwiseLoaded()
							? "BetterDiscord is currently loaded by some other mechanism."
							: undefined;

		return html`
			<${SwitchItem}
				value=${() => props.value}
				onChange=${(e) => props.onChange?.(e)}
				note=${() => props.data.desc}
				disabled=${() => !!disabled()}
				tooltip=${() => disabled()}
			>
				${() => props.data.name}
			<//>
		`;
	}

	function SettingsView() {
		// a Set<string> of branches
		const [pendingBranches, setPendingBranches] = createSignal(new Set(currentBranches()));

		// basically a set inequality test
		const unsavedChanges = () => {
			const a = pendingBranches();
			const b = new Set(currentBranches());
			return a.size !== b.size || !a.isSubsetOf(b);
		};

		const isUninstalled = () => !currentBranches().length;

		// this is really silly
		return () => {
			if (isUninstalled()) {
				return html`<${UninstalledSplash} />`;
			}

			return html`
			  <${Header} tag=${HeaderTags.H1} style="margin-bottom: 1rem">Client Mod Settings<//>

				<${Text}>
					Your installation of ${() => prettyModNames(currentBranches)} is being managed by
					<${Space} />
					<${LinkButton} href="https://github.com/uwu/sheltupdate">sheltupdate<//>.
					You can change the mods you are loading below.
				<//>

			  <${Divider} mt mb />

			  <!-- lol .map(), what is this, react? -->
			  ${() =>
					Object.values(branchMetaGrouped())
						.flatMap(Object.entries)
						.map(
							([branchName, branchData]) => html`
						<${BranchEntry}
							name=${() => branchName}
							data=${() => branchData}
							value=${() => pendingBranches().has(branchName)}
							onChange=${(e) => {
								const pb = pendingBranches();
								if (e) pb.add(branchName);
								else pb.delete(branchName);
								// reactivity ugh
								setPendingBranches(new Set(pb));
							}}
						/>
					`,
						)}

			  <div style="display: flex">
				  ${() =>
						unsavedChanges()
							? html`
							<${Text}>
								You have unsaved changes!<br />
								Applying will require fully closing and reopening Discord.
							<//>
							<div style="flex: 1" />
							<${Button} grow onClick=${(e) => {
								SheltupdateNative.setBranches([...pendingBranches()]).then(updateCurrent, (err) => {
									updateCurrent();
									showToast({
										title: "Failed to change mods!",
										content: err?.message ?? err,
										duration: 3000,
									});
								});
							}}
							>
								Save Mods
							<//>
						`
							: html`<div style="flex: 1" />`}

				  <${Button}
					  grow
					  color=${ButtonColors.RED}
					  onClick=${(e) => {
							setUninstallCache(currentBranches());
							SheltupdateNative.uninstall().then(updateCurrent, (err) => {
								updateCurrent();
								showToast({
									title: "Failed to change mods!",
									content: err?.message ?? err,
									duration: 3000,
								});
							});
						}}
					  style=${{ "margin-left": "1rem" }}
				  >
					  Uninstall shelter
				  <//>
			  </div>
			`;
		};
	}

	function UninstalledSplash() {
		return html`
			<div style="display: flex; flex-direction: column; align-items: center; height: calc(100vh - 140px); text-align: center; justify-content: center; gap: .5rem;">
				<${Header} tag=${HeaderTags.H1} style="margin-bottom: 1rem">
					sheltupdate will be uninstalled at next Discord app restart
				<//>
				<${Text}>
					Your plugins, themes, settings, etc. have not been deleted and will be remembered if
					you reinstall sheltupdate in the future, or switch to some other injection method.
				<//>
				<${Text}>
					Change your mind? Until you restart Discord, you can retrieve your installation of
					<${Space} />
					${() => prettyModNames(uninstallCache)}
					<${Space} />
					exactly as it was before.
				<//>

				<${Button}
					grow
					color=${ButtonColors.GREEN}
					onClick=${(e) =>
						SheltupdateNative.setBranches(uninstallCache()).then(updateCurrent, (err) => {
							updateCurrent();
							showToast({
								title: "Failed to change mods!",
								content: err?.message ?? err,
								duration: 3000,
							});
						})}
					style=${{ "margin-top": "2rem" }}
				>
					Revert uninstall
				<//>
			</div>
		`;
	}
})();
