(() => {
	const {
		plugins: { removePlugin },
		solid: { createSignal, createMemo, onCleanup, untrack },
		solidH: { html },
		ui: {
			Text,
			TextTags,
			LinkButton,
			Divider,
			Button,
			ButtonColors,
			ButtonLooks,
			ButtonSizes,
			TextBox,
			showToast,
			Header,
			HeaderTags,
			SwitchItem,
			Space,
			openModal,
			ModalRoot,
			ModalHeader,
			ModalBody,
			ModalFooter,
			ModalConfirmFooter,
			ModalSizes,
		},
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

	const [currentHost, setCurrentHost] = createSignal();

	// just because i don't trust myself, keep a copy of the branch before uninstalling sheltupdate.
	const [uninstallCache, setUninstallCache] = createSignal();

	const [vencordOtherwiseLoaded, setVencordOtherwiseLoaded] = createSignal(false);
	const [bdOtherwiseLoaded, setBdOtherwiseLoaded] = createSignal(false);

	const updateCurrent = () =>
		Promise.all([
			SheltupdateNative.getCurrentBranches().then(setCurrentBranches),
			SheltupdateNative.getCurrentHost().then(setCurrentHost),
		]);
	updateCurrent().then(() => {
		if (window.Vencord && !currentBranches().includes("vencord") && !currentBranches().includes("equicord"))
			setVencordOtherwiseLoaded(true);

		if (window.BdApi && !currentBranches().includes("betterdiscord")) setBdOtherwiseLoaded(true);
	});

	SheltupdateNative.getAvailableBranches().then((branches) => {
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
		const modNames = [...branches.filter((b) => b !== "shelter").map((b) => branchMetaRaw()[b].name)];

		// make sure that shelter always comes first
		if (branches.includes("shelter")) {
			modNames.unshift("shelter");
		}

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
		const disabled = () => {
			if (props.name === "shelter" && props.value) {
				return "You need shelter to have access to this menu. Try uninstalling sheltupdate.";
			}
			if ((props.name === "vencord" || props.name === "equicord") && vencordOtherwiseLoaded()) {
				return "Vencord or Equicord are currently loaded by some other mechanism.";
			}
			if (props.name === "betterdiscord" && bdOtherwiseLoaded()) {
				return "BetterDiscord is currently loaded by some other mechanism.";
			}
		};

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
					Your installation of ${() => prettyModNames(currentBranches())} is being managed by
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
							onChange=${async (e) => {
								const pb = pendingBranches();
								if (e) {
									const foundIncompatibilities = branchData.incompatibilities.filter((i) => pb.has(i));
									if (foundIncompatibilities.length > 0) {
										const res = await openIncompatibilityModal(
											branchData.displayName,
											foundIncompatibilities,
										);
										if (res === "disableOthers") {
											foundIncompatibilities.forEach((b) => pb.delete(b));
										} else if (res === "cancel") {
											return;
										}
									}
									pb.add(branchName);
								} else {
									pb.delete(branchName);
								}
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

			  <${InstanceName} />
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
					${() => prettyModNames(uninstallCache())}
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

	function InstanceName() {
		return html`
			<span>
				<${Text} tag=${TextTags.textSM}>
					sheltupdate instance: ${currentHost}
				<//>
				<${Button}
					grow
					color=${ButtonColors.SECONDARY}
					size=${ButtonSizes.TINY}
					style=${{ display: "inline-block", "margin-left": ".5rem" }}
					onClick=${(e) =>
						openHostChangeModal().then((v) =>
							SheltupdateNative.setCurrentHost(v).then(updateCurrent, (err) => {
								updateCurrent();
								showToast({
									title: "Failed to change host!",
									content: err?.message ?? err,
									duration: 3000,
								});
							}),
						)}
				>Change</Button>
			</span>
		`;
	}

	async function openIncompatibilityModal(branchName, incompatibleBranches) {
		return new Promise((resolve) => {
			openModal(({ close }) => {
				onCleanup(() => resolve("cancel"));
				const incompatibleBranchNames = prettyModNames(incompatibleBranches);
				return html`
					<${ModalRoot}>
						<${ModalHeader} close=${(e) => close()}>
							Things might break!
						<//>
						<${ModalBody}>
							${branchName} may not work properly alongside ${incompatibleBranchNames}.<br />
							Do you want to disable ${incompatibleBranchNames}?
						<//>
						<${ModalFooter}>
							<div style="display: flex; justify-content: flex-end; gap: .5rem;">
								<${Button}
									look=${ButtonLooks.LINK}
									size=${ButtonSizes.MEDIUM}
									grow
									onClick=${(e) => {
										resolve("cancel");
										close();
									}}
								>
									Cancel
								<//>
								<${Button}
									color=${ButtonColors.GREEN}
									size=${ButtonSizes.MEDIUM}
									grow
									onClick=${(e) => {
										resolve("disableOthers");
										close();
									}}
								>
									Disable ${incompatibleBranches.length > 1 ? "them" : "it"}
								<//>
								<${Button}
									color=${ButtonColors.RED}
									size=${ButtonSizes.MEDIUM}
									grow
									onClick=${(e) => {
										resolve("proceed");
										close();
									}}
								>
									Proceed anyways
								<//>
							</div>
						<//>
					<//>
				`;
			});
		});
	}

	async function openHostChangeModal() {
		return new Promise((res, rej) =>
			openModal(({ close }) => {
				onCleanup(rej);

				const [newHost, setNewHost] = createSignal(untrack(currentHost));

				const validationIssue = createMemo(() => {
					// must be a URL
					let url;
					try {
						url = new URL(newHost());
					} catch {
						return "Not a valid URL";
					}

					// must not have a trailing path, else branch setting logic would break
					if (url.pathname !== "/") return "Hosts must not have a path";

					// don't have a trailing /
					if (newHost().endsWith("/")) return "Hosts must not have a trailing /";

					// openasar does not support http
					if (url.protocol !== "https:") {
						if (url.protocol === "http:") {
							if (window.openasar) return "OpenAsar does not work with insecure hosts";
						} else return "Hosts must be http: or https:";
					}
				});

				return html`
				<${ModalRoot} size=${ModalSizes.MEDIUM}>
					<${ModalHeader} close=${close}>Change sheltupdate instance<//>
					<${ModalBody}>
						<p><${Text}>
							You can host your own instance of sheltupdate, instead of using uwu.network's official instance,
							and switch to using it here.
						<//></p>
						<p><${Text}>
							We suggest using the official instance as it is always up-to-date,
							runs unmodified official sheltupdate code, and has high reliability.
							We run a
							<${Space} />
							<${LinkButton} onClick=${(e) => setNewHost("https://inject.shelter.uwu.network")}>stable instance<//>
							<${Space} />
							and a
							<${Space} />
							<${LinkButton} onClick=${(e) => setNewHost("https://staging.shelter.uwu.network")}>staging instance<//>.
						<//></p>
						<p><${Text}>
							If someone has told you to change this, be sure you trust them, as the server that you specify here
							can deliver code to you that will be run when you open Discord, with full access to your computer.
						<//></p>
						<${Divider} />

						<${TextBox}
							value=${newHost}
							onInput=${(v) => setNewHost(v)}
							style=${() => (validationIssue() ? { border: "1px solid var(--input-border-critical)" } : {})}
						/>
						<${Text} tag=${TextTags.textSM} style=${{ color: "var(--text-critical)" }}>
							${validationIssue}
						<//>
					<//>
					<${ModalConfirmFooter} close=${() => close} disabled=${validationIssue} onConfirm=${() => res(newHost())} />
				<//>
			`;
			}),
		);
	}
})();
