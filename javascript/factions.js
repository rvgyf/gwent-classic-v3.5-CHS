"use strict"

var factions = {
	realms: {
		name: "北方领域",
		factionAbility: player => game.roundStart.push(async () => {
			if (game.roundCount > 1 && game.roundHistory[game.roundCount - 2].winner === player) {
				player.deck.draw(player.hand);
				await ui.notification("north", 1200);
			}
			return false;
		}),
		activeAbility: false,
		abilityUses: 0,
		description: "每赢得一回合，便从牌组中抽一张牌。"
	},
	nilfgaard: {
		name: "尼弗迦德帝国",
		description: "在任何平局的回合中获胜。",
		activeAbility: false,
		abilityUses: 0
	},
	monsters: {
		name: "怪物",
		factionAbility: player => game.roundEnd.push( () => {
			let units = board.row.filter( (r,i) => player === player_me ^ i < 3)
				.reduce((a,r) => r.cards.filter(c => c.isUnit()).concat(a), []);
			if (units.length === 0)
				return;
			let card = units[randomInt(units.length)];
			card.noRemove = true;
			game.roundStart.push(async () => {
				await ui.notification("monsters", 1200);
				delete card.noRemove;
				return true; 
			});
			return false;
		}),
		description: "每回合结束后随机保留一张单位牌在场上。",
		activeAbility: false,
		abilityUses: 0
	},
	scoiatael: {
		name: "松鼠党",
		factionAbility: player => game.gameStart.push(async () => {
			let notif = "";
			if (player === player_me && !(player.controller instanceof ControllerAI)) {
				await ui.popup("先手 [E]", () => game.firstPlayer = player, "后手 [Q]", () => game.firstPlayer = player.opponent(), "你想先手吗？", "松鼠党阵营特权允许你决定谁先行动。");
				notif = game.firstPlayer.tag + "-first";
			} else if (player.controller instanceof ControllerAI) {
				if (Math.random() < 0.5) {
					game.firstPlayer = player;
					notif = "scoiatael";
				} else {
					game.firstPlayer = player.opponent();
					notif = game.firstPlayer.tag + "-first";
				}
			}
			await ui.notification(notif, 1200);
			return true;
		}),
		description: "决定谁先行动。",
		activeAbility: false,
		abilityUses: 0
	},
	skellige: {
		name: "史凯利格",
		factionAbility: player => game.roundStart.push( async () => {
			if (game.roundCount != 3) return false;
			await ui.notification("skellige-" + player.tag, 1200);
			await Promise.all(player.grave.findCardsRandom(c => c.isUnit(), 2).map(c => board.toRow(c, player.grave)));
			return true;
		}),
		description: "第三回合开始时，从弃牌堆中随机将 2 张牌放置到战场上。",
		activeAbility: false,
		abilityUses: 0
	},
	witcher_universe: {
		name: "猎魔人宇宙",
		factionAbility: async player => {
			await ui.notification("witcher_universe", 1200);
		},
		factionAbilityInit: player => game.roundStart.push(async () => {
			player.updateFactionAbilityUses(1);
			return false;
		}),
		description: "每回合可以跳过一回合。",
		activeAbility: true,
		abilityUses: 1,
		weight: (player) => {
			return 20;
		}
	},
	toussaint: {
		name: "陶森特",
		factionAbility: player => game.roundStart.push(async () => {
			if (game.roundCount > 1 && !(game.roundHistory[game.roundCount - 2].winner === player)) {
				player.deck.draw(player.hand);
				await ui.notification("toussaint", 1200);
			}
			return false;
		}),
		activeAbility: false,
		abilityUses: 0,
		description: "每输掉一回合，便从牌组中抽一张牌。"
	},
	lyria_rivia: {
		name: "莱里亚与利维亚",
		factionAbility: player => {
			let card = new Card("spe_lyria_rivia_morale", card_dict["spe_lyria_rivia_morale"], player);
			card.removed.push(() => setTimeout(() => card.holder.grave.removeCard(card), 2000));
			card.placed.push(async () => await ui.notification("lyria_rivia", 1200));
			player.endTurnAfterAbilityUse = false;
			ui.showPreviewVisuals(card);
			ui.enablePlayer(true);
			if (!(player.controller instanceof ControllerAI)) ui.setSelectable(card, true);
		},
		activeAbility: true,
		abilityUses: 1,
		description: "在所选排上施加士气鼓舞效果（本回合所有单位获得 +1 加成）。",
		weight: (player) => {
			let units = player.getAllRowCards().concat(player.hand.cards).filter(c => c.isUnit()).filter(c => !c.abilities.includes("spy"));
			let rowStats = {
				"close": 0,
				"ranged": 0,
				"siege": 0,
				"agile": 0
			};
			units.forEach(c => {
				rowStats[c.row] += 1;
			});
			rowStats["close"] += rowStats["agile"];
			return Math.max(rowStats["close"], rowStats["ranged"], rowStats["siege"]);
		}
	},
	syndicate: {
		name: "辛迪加",
		factionAbility: player => game.gameStart.push(async () => {
			let card = new Card("sy_sigi_reuven", card_dict["sy_sigi_reuven"], player);
			await board.addCardToRow(card, card.row, card.holder);
		}),
		activeAbility: false,
		abilityUses: 0,
		description: "开局时，场上拥有英雄牌西吉·卢文。"
	},
	zerrikania: {
		name: "泽瑞坎尼亚",
		factionAbility: player => game.roundStart.push(async () => {
			if (game.roundCount > 1 && !(game.roundHistory[game.roundCount - 2].winner === player)) {
				if (player.grave.findCards(c => c.isUnit()) <= 0) return;
				let grave = player.grave;
				let respawns = [];
				if (player.controller instanceof ControllerAI) {
					respawns.push({
						card: player.controller.medic(player.leader, grave)
					});
				} else {
					await ui.queueCarousel(player.grave, 1, (c, i) => respawns.push({
						card: c.cards[i]
					}), c => c.isUnit(), true);
				}
				await Promise.all(respawns.map(async wrapper => {
					let res = wrapper.card;
					grave.removeCard(res);
					grave.addCard(res);
					await res.animate("medic");
					await res.autoplay(grave);
				}));
				await ui.notification("zerrikania", 1200);
			}
			return false;
		}),
		activeAbility: false,
		abilityUses: 0,
		description: "每输掉一回合，便从弃牌堆中复活一个单位。"
	}
}