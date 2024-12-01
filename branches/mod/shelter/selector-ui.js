(() => {

	const {
		plugins: {removePlugin},
		solid: {createSignal},
		solidH: {html},
		ui: {
         Text,
			LinkButton,
			Divider,
			Button,
			ButtonColors,
			showToast,
			Header,
			HeaderTags,
			SwitchItem,
			Space
		}
	} = shelter;

	const {
		settings: { registerSection }
	} = shelter.plugin.scoped;

	// deal with this plugin still existing after sheltupdate is gone!
	if (!window.SheltupdateNative) {
		const id = shelter.plugin.id;
		setTimeout(() => removePlugin(id), 50);
		return; // don't init or anything
	}

	// TODO: have some kind of api for returning metadata etc from the server

	const [branchMetaRaw, setBranchMetaRaw] = createSignal();
	const [branchMetaGrouped, setBranchMetaGrouped] = createSignal();
	const [currentBranches, setCurrentBranches] = createSignal();

	const [vencordOtherwiseLoaded, setVencordOtherwiseLoaded] = createSignal(false);
	const [bdOtherwiseLoaded, setBdOtherwiseLoaded] = createSignal(false);

	const updateCurrent = () => SheltupdateNative.getCurrentBranches().then(setCurrentBranches);
	updateCurrent().then(() => {
		if (window.Vencord && !currentBranches.includes("vencord"))
			setVencordOtherwiseLoaded(true);

		if (window.BdApi && !currentBranches.includes("betterdiscord"))
			setBdOtherwiseLoaded(true);
	});

	SheltupdateNative.getAllowedBranches().then(branches => {
		// group by type, conveniently "mod" is before "tool" alphabetically
      const grouped = {};
		for (const branchName in branches) {
			const data = branches[branchName];
			if (!grouped[data.type])
				grouped[data.type] = {};

			grouped[data.type][branchName] = data;
		}

		setBranchMetaGrouped(grouped);
		setBranchMetaRaw(branches);
	});

	// ok so this will display *above* the shelter heading which is not ideal but its okay i guess
	registerSection("divider");
	registerSection("header", "Sheltupdate");
	registerSection("section", "sheltupdate", "Client Mods", SettingsView);

	function Heading() {
		const prettyModNames = () => {
			const modNames = ["shelter", ...currentBranches().filter(b => b !== "shelter").map(b => branchMetaRaw()[b].name)];

			if (modNames.length === 1) return modNames[0];
			const lastMod = modNames.pop()
			return modNames.join(", ") + ", and " + lastMod;
		};

		return html`
			<!-- weird that theres not a nice margin here by default -->
			<${Header} tag=${HeaderTags.H1} style="margin-bottom: 1rem">Client Mod Settings<//>

			<${Text}>
				Your installation of ${() => prettyModNames()} is being managed by
				<${Space} />
				<${LinkButton} href="https://github.com/uwu/sheltupdate">sheltupdate<//>.
				You can change the mods you are loading below.
			<//>
		`;
	}

	function BranchEntry(props/*: { name, data, value, onChange } */) {
		// note: if shelter is disabled (i.e. you uninstalled sheltupdate), allow switching back on
		const disabled = () => props.name === "shelter" && props.value
			? "You need shelter to have access to this menu. Try uninstalling sheltupdate."
			: props.name === "vencord" && vencordOtherwiseLoaded()
				? "Vencord is currently loaded by some other mechanism."
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

		return html`
		  <${Heading} />

		  <${Divider} mt mb />

		  ${() => unsavedChanges()
				? html`
					<div style="display: flex">
					<${Text}>You have unsaved changes! Applying will require fully closing and reopening Discord.<//>
					<div style="flex: 1" />
					<${Button} grow onClick=${(e) => {
						SheltupdateNative.setBranches([...pendingBranches()])
							.then(updateCurrent, (err) => {
								updateCurrent();
								showToast({
									title: "Failed to change mods!",
									content: err?.message ?? err,
									duration: 3000
								});
							});
						}}
					>
						Save Mods
					<//>
					</div>

					<${Divider} mt mb />
				`
				: []
			}

		  <!-- TODO: nice banner for when uninstalled (shelter is disabled) -->

		  <!-- lol .map(), what is this, react? -->
		  ${() => Object.values(branchMetaGrouped()).flatMap(Object.entries)
			  .map(([branchName, branchData]) => html`
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
				`)}

		  <!-- TODO: interactive -->
		  <${Button} grow color=${ButtonColors.RED}>Uninstall shelter<//>
		`;
	}

})();