"use strict"

var ability_dict = {
	clear: {
		name: "晴朗天气",
		description: "移除所有天气牌（刺骨冰霜、厚重迷雾和倾盆大雨）的效果。"
	},
	frost: {
		name: "刺骨冰霜",
		description: "将双方所有近战单位的战力设为 1。"
	},
	fog: {
		name: "厚重迷雾",
		description: "将双方所有远程单位的战力设为 1。"
	},
	rain: {
		name: "倾盆大雨",
		description: "将双方所有攻城单位的战力设为 1。"
	},
	storm: {
		name: "史凯利格风暴",
		description: "将所有远程和攻城单位的战力降至 1。"
	},
	hero: {
		name: "英雄",
		description: "不受任何特殊牌或技能的影响。"
	},
	decoy: {
		name: "诱饵",
		description: "与战场上的一张牌交换，使其回到你的手牌。"
	},
	horn: {
		name: "指挥官之角",
		description: "使该排所有单位牌的战力翻倍。每排限一张。",
		placed: async card => await card.animate("horn")
	},
	mardroeme: {
		name: "曼陀罗",
		description: "触发同一排所有狂战士牌的变身。",
		placed: async (card, row) => {
			if (card.isLocked()) return;
			let berserkers = row.findCards(c => c.abilities.includes("berserker"));
			await Promise.all(berserkers.map(async c => await ability_dict["berserker"].placed(c, row)));
		}
	},
	berserker: {
		name: "狂战士",
		description: "当同排有曼陀罗牌时变身为熊。",
		placed: async (card, row) => {
			if (row.effects.mardroeme === 0 || card.isLocked()) return;
			row.removeCard(card);
			await row.addCard(new Card(card.target, card_dict[card.target], card.holder));
		}
	},
	scorch: {
		name: "焦炎",
		description: "打出后弃置。摧毁战场上最强的卡牌。",
		activated: async card => {	
			await ability_dict["scorch"].placed(card);
			await board.toGrave(card, card.holder.hand);
		},
		placed: async (card, row) => {
			if (card.isLocked() || game.scorchCancelled) return;
			if (row !== undefined) row.cards.splice(row.cards.indexOf(card), 1);
			let maxUnits = board.row.map(r => [r, r.maxUnits()]).filter(p => p[1].length > 0).filter(p => !p[0].isShielded());
			if (row !== undefined) row.cards.push(card);
			let maxPower = maxUnits.reduce((a,p) => Math.max(a, p[1][0].power), 0);
			let scorched = maxUnits.filter(p => p[1][0].power === maxPower);
			let cards = scorched.reduce((a, p) => a.concat(p[1].map(u => [p[0], u])), []);
			await Promise.all(cards.map(async u => await u[1].animate("scorch", true, false)));
			await Promise.all(cards.map(async u => await board.toGrave(u[1], u[0])));
		}
	},
	scorch_c: {
		name: "焦炎 - 近战",
		description: "如果敌方所有近战单位的战力总和大于等于 10，则摧毁其最强的近战单位。",
		placed: async (card) => await board.getRow(card, "close", card.holder.opponent()).scorch()
	},
	scorch_r: {
		name: "焦炎 - 远程",
		description: "如果敌方所有远程单位的战力总和大于等于 10，则摧毁其最强的远程单位。",
		placed: async (card) => await board.getRow(card, "ranged", card.holder.opponent()).scorch()
	},
	scorch_s: {
		name: "焦炎 - 攻城",
		description: "如果敌方所有攻城单位的战力总和大于等于 10，则摧毁其最强的攻城单位。",
		placed: async (card) => await board.getRow(card, "siege", card.holder.opponent()).scorch()
	},
	agile: {
		name: "灵活",
		description: "可以放置在近战排或远程排。放置后无法移动。"
	},
	muster: {
		name: "集结",
		description: "从你的牌组中找出所有同名卡牌并立即打出。",
		placed: async (card) => {
			if (card.isLocked()) return;
			let pred = c => c.target === card.target;
			let units = card.holder.hand.getCards(pred).map(x => [card.holder.hand, x])
				.concat(card.holder.deck.getCards(pred).map(x => [card.holder.deck, x]));
			if (units.length === 0) return;
			await card.animate("muster");
			if (card.row === "agile") await Promise.all(units.map(async p => await board.addCardToRow(p[1], card.currentLocation, p[1].holder, p[0])));
			else await Promise.all(units.map(async p => await board.addCardToRow(p[1], p[1].row, p[1].holder, p[0])));
		}
	},
	spy: {
		name: "间谍",
		description: "放置在对手战场上（计入对手总分），并从你的牌组抽取 2 张牌。",
		placed: async (card) => {
			if (card.isLocked()) return;
			await card.animate("spy");
			for (let i = 0; i < 2; i++) {
				if (card.holder.deck.cards.length > 0) await card.holder.deck.draw(card.holder.hand);
			}
			card.holder = card.holder.opponent();
		}
	},
	medic: {
		name: "医疗兵",
		description: "从你的弃牌堆中选择一张牌并立即打出（不包括英雄牌或特殊牌）。",
		placed: async (card) => {
			if (card.isLocked() || (card.holder.grave.findCards(c => c.isUnit()) <= 0)) return;
			let grave = board.getRow(card, "grave", card.holder);
			let respawns = [];
			if (game.randomRespawn) {
				for (var i = 0; i < game.medicCount; i++) {
					if (card.holder.grave.findCards(c => c.isUnit()).length > 0) {
						let res = grave.findCardsRandom(c => c.isUnit())[0];
						grave.removeCard(res);
						grave.addCard(res);
						await res.animate("medic");
						await res.autoplay(grave);
					}
				}
				return;
			} else if (card.holder.controller instanceof ControllerAI) {
				for (var i = 0; i < game.medicCount; i++) {
					if (card.holder.grave.findCards(c => c.isUnit()).length > 0) {
						let res = card.holder.controller.medic(card, grave);
						grave.removeCard(res);
						grave.addCard(res);
						await res.animate("medic");
						await res.autoplay(grave);
					}
				}
				return;
			}
			await ui.queueCarousel(card.holder.grave, game.medicCount, (c, i) => respawns.push({ card: c.cards[i] }), c => c.isUnit(), true);
			await Promise.all(respawns.map(async wrapper => {
				let res = wrapper.card;
				grave.removeCard(res);
				grave.addCard(res);
				await res.animate("medic");
				await res.autoplay(grave);
			}));
		}
	},
	morale: {
		name: "士气鼓舞",
		description: "为该排所有单位增加 +1 战力（不包括自身）。",
		placed: async card => await card.animate("morale")
	},
	bond: {
		name: "紧密羁绊",
		description: "与一张同名卡牌相邻放置时，双方战力翻倍。",
		placed: async card => {
			if (card.isLocked()) return;
			let bonds = card.currentLocation.findCards(c => c.target === card.target).filter(c => c.abilities.includes("bond")).filter(c => !c.isLocked());
			if (bonds.length > 1) await Promise.all(bonds.map(c => c.animate("bond")));
		}
	},
	avenger: {
		name: "复仇者",
		description: "当此牌从战场上被移除时，召唤一张强大的新单位牌替代它。",
		removed: async (card) => {
			if (game.over || game.roundHistory.length > 2 || card.isLocked()) return;
			if (card_dict[card.target]["ability"].includes("muster") && (card.holder.deck.findCards(c => c.key === card.target).length === 0 && card.holder.hand.findCards(c => c.key === card.target).length === 0)) {
				for (let i = 0; i < card_dict[card.target]["count"]; i++) {
					let avenger = new Card(card.target, card_dict[card.target], card.holder);
					avenger.removed.push(() => setTimeout(() => avenger.holder.grave.removeCard(avenger), 2000));
					if (card.target != card.key) await board.addCardToRow(avenger, avenger.row, card.holder);
				}
			} else if (card.target === card.key) await board.moveTo(card, card.row, card.holder.grave);
			else {
				let avenger;
				if (card.holder.deck.findCards(c => c.key === card.target).length) {
					avenger = card.holder.deck.findCard(c => c.key === card.target);
					await board.moveTo(avenger, avenger.row, card.holder.deck);
				} else if (card.holder.hand.findCards(c => c.key === card.target).length) {
					avenger = card.holder.hand.findCard(c => c.key === card.target);
					await board.moveTo(avenger, avenger.row, card.holder.hand);
				} else {
					avenger = new Card(card.target, card_dict[card.target], card.holder);
					await board.addCardToRow(avenger, avenger.row, card.holder);
					if (card.target != card.key) avenger.removed.push(() => setTimeout(() => avenger.holder.grave.removeCard(avenger), 2000));
				}
			}
		},
		weight: (card) => {
			if (game.roundHistory.length > 2) return 1;
			return Number(card_dict[card.target]["strength"]);
		}
	},
	cintra_slaughter: {
		name: "辛特拉大屠杀",
		description: "使用辛特拉大屠杀特殊牌时，摧毁己方战场上所有拥有辛特拉大屠杀技能的单位，然后每摧毁一个单位便抽一张牌。",
		activated: async card => {
			let targets = board.row.map(r => [r, r.findCards(c => c.abilities.includes("cintra_slaughter")).filter(c => c.holder === card.holder).filter(c => !c.isLocked())]);
			let cards = targets.reduce((a, p) => a.concat(p[1].map(u => [p[0], u])), []);
			let nb_draw = cards.length;
			await Promise.all(cards.map(async u => await u[1].animate("scorch", true, false)));
			await Promise.all(cards.map(async u => await board.toGrave(u[1], u[0])));
			await board.toGrave(card, card.holder.hand);
			for (let i = 0; i < nb_draw; i++) {
				if (card.holder.deck.cards.length > 0) await card.holder.deck.draw(card.holder.hand);
			}
		},
		weight: (card) => 30
	},
	foltest_king: {
		description: "从你的牌组中选择一张厚重迷雾牌并立即打出。",
		activated: async card => {
			let out = card.holder.deck.findCard(c => c.key === "spe_fog");
			if (out) {  
				tocar("leader", false);
				await out.autoplay(card.holder.deck);
			}
		},
		weight: (card, ai) => ai.weightWeatherFromDeck(card, "fog")
	},
	foltest_lord: {
		description: "清除场上所有天气效果（由刺骨冰霜、倾盆大雨或厚重迷雾牌产生）。",
		activated: async () => {
			let cineOverlay = document.createElement("div");
			cineOverlay.className = "sunlight-overlay-cinema";
			let solarBeam = document.createElement("div");
			solarBeam.className = "sunlight-beam-wave";
			cineOverlay.appendChild(solarBeam);
			document.body.appendChild(cineOverlay);
			setTimeout(() => {
				if (cineOverlay) cineOverlay.remove();
			}, 2000);
			tocar("leader", false);
			await sleep(500);
			await weather.clearWeather()
		},
		weight: (card, ai) =>  ai.weightCard(card_dict["spe_clear"])
	},
	foltest_siegemaster: {
		description: "使己方所有攻城单位的战力翻倍（若该排已有指挥官之角则无效）。",
		activated: async card => { 
			tocar("leader", false);
			await board.getRow(card, "siege", card.holder).leaderHorn(card);
		},
		weight: (card, ai) => ai.weightHornRow(card, board.getRow(card, "siege", card.holder))
	},
	foltest_steelforged: {
		description: "如果敌方所有攻城单位的战力总和大于等于 10，则摧毁其最强的攻城单位。",
		activated: async card => {
			tocar("leader", false);
			await ability_dict["scorch_s"].placed(card);
		},
		weight: (card, ai, max) => ai.weightScorchRow(card, max, "siege")
	},
	foltest_son: {
		description: "如果敌方所有远程单位的战力总和大于等于 10，则摧毁其最强的远程单位。",
		activated: async card => { 
			tocar("leader", false);
			await ability_dict["scorch_r"].placed(card);
		},
		weight: (card, ai, max) => ai.weightScorchRow(card, max, "ranged")
	},
	emhyr_imperial: {
		description: "从你的牌组中选择一张倾盆大雨牌并立即打出。",
		activated: async card => {
			let out = card.holder.deck.findCard(c => c.key === "spe_rain");
			if (out) {
				tocar("leader", false);
				await out.autoplay(card.holder.deck);
			}
		},
		weight: (card, ai) => ai.weightWeatherFromDeck(card, "rain")
	},
	emhyr_emperor: {
		description: "查看对手手牌中的 3 张随机卡牌。",
		activated: async card => {
			if (card.holder.controller instanceof ControllerAI) return;
			let container = new CardContainer();
			container.cards = card.holder.opponent().hand.findCardsRandom(() => true, 3);
			try {
				Carousel.curr.cancel();
			} catch (err) {}
			tocar("leader", false);
			await ui.viewCardsInContainer(container);
		},
		weight: card => {
			let count = card.holder.opponent().hand.cards.length;
			return count === 0 ? 0 : Math.max(10, 10 * (8 - count));
		}
	},
	emhyr_whiteflame: {
		description: "取消对手的领袖技能。"
	},
	emhyr_relentless: {
		description: "从对手的弃牌堆中抽一张牌。",
		activated: async card => {
			let grave = board.getRow(card, "grave", card.holder.opponent());
			if (grave.findCards(c => c.isUnit()).length === 0) return;
			if (card.holder.controller instanceof ControllerAI) {
				let newCard = card.holder.controller.medic(card, grave);
				newCard.holder = card.holder;
				tocar("leader", false);
				await board.toHand(newCard, grave);
				return;
			}
			try {
				Carousel.curr.cancel();
			} catch (err) {}
			await ui.queueCarousel(grave, 1, (c,i) => {
				let newCard = c.cards[i];
				newCard.holder = card.holder;
				tocar("leader", false);
				board.toHand(newCard, grave);
			}, c => c.isUnit(), true);
		},
		weight: (card, ai, max, data) => ai.weightMedic(data, 0, card.holder.opponent())
	},
	emhyr_invader: {
		description: "复活单位的能力将改为随机选择一个单位。对双方均有效。",
		gameStart: () => game.randomRespawn = true
	},
	eredin_commander: {
		description: "使己方所有近战单位的战力翻倍（若该排已有指挥官之角则无效）。",
		activated: async card => {
			tocar("leader", false);
			await board.getRow(card, "close", card.holder).leaderHorn(card);
		},
		weight: (card, ai) => ai.weightHornRow(card, board.getRow(card, "close", card.holder))
	},
	eredin_bringer_of_death: {
		name: "艾瑞汀：死亡使者",
		description: "从你的弃牌堆中将一张牌收回手牌。",
		activated: async card => {
			let newCard;
			if (card.holder.controller instanceof ControllerAI) newCard = card.holder.controller.medic(card, card.holder.grave);
			else {
				try {
					Carousel.curr.exit();
				} catch (err) {}
				await ui.queueCarousel(card.holder.grave, 1, (c,i) => newCard = c.cards[i], c => c.isUnit(), false, false);
			}
			if (newCard) {
				tocar("leader", false);
				await board.toHand(newCard, card.holder.grave);
			}
		},
		weight: (card, ai, max, data) => ai.weightMedic(data, 0, card.holder)
	},
	eredin_destroyer: {
		description: "弃置 2 张牌，并从你的牌组中选择 1 张牌抽取。",
		activated: async (card) => {
			tocar("leader", false);
			let hand = board.getRow(card, "hand", card.holder);
			let deck = board.getRow(card, "deck", card.holder);
			if (!(card.holder.controller instanceof ControllerAI)) {
				if (!hand || hand.cards.length < 2) {
					tocar("menu_buy", false); 
					ui.enablePlayer(true);
					return;
				}
			}
			if (card.holder.controller instanceof ControllerAI) {
				let cards = card.holder.controller.discardOrder(card).splice(0, 2).filter(c => c.basePower < 7);
				await Promise.all(cards.map(async c => await board.toGrave(c, card.holder.hand)));
				card.holder.deck.draw(card.holder.hand);
				return;
			} else {
				try {
					Carousel.curr.exit();
				} catch (err) {}
			}
			await ui.queueCarousel(hand, 2, (c,i) => board.toGrave(c.cards[i], c), () => true);
			await ui.queueCarousel(deck, 1, (c,i) => board.toHand(c.cards[i], deck), () => true, true);
		},
		weight: (card, ai) => {
			let cards = ai.discardOrder(card).splice(0,2).filter(c => c.basePower < 7);
			if (cards.length < 2) return 0;
			return cards[0].abilities.includes("muster") ? 50 : 25;
		}
	},
	eredin_king: {
		description: "从你的牌组中选择任意一张天气牌并立即打出。",
		activated: async card => {
			tocar("leader", false);
			let deck = board.getRow(card, "deck", card.holder);
			if (card.holder.controller instanceof ControllerAI) await ability_dict["eredin_king"].helper(card).card.autoplay(card.holder.deck);
			else {
				try {
					Carousel.curr.cancel();
				} catch (err) { }
				await ui.queueCarousel(deck, 1, (c,i) => board.toWeather(c.cards[i], deck), c => c.faction === "weather", true);
			}
		},
		weight: (card, ai, max) => ability_dict["eredin_king"].helper(card).weight,
		helper: card => {
			let weather = card.holder.deck.cards.filter(c => c.row === "weather").reduce((a,c) => a.map(c => c.name).includes(c.name) ? a : a.concat([c]), []);
			let out, weight = -1;
			weather.forEach(c => {
				let w = card.holder.controller.weightWeatherFromDeck(c, c.abilities[0]);
				if (w > weight) {
					weight = w;
					out = c;
				}
			});
			return {
				card: out,
				weight: weight
			};
		}
	},
	eredin_treacherous: {
		description: "使所有间谍牌的战力翻倍（对双方均有效）。",
		gameStart: () => game.spyPowerMult = 2
	},
	francesca_queen: {
		description: "如果敌方所有近战单位的战力总和大于等于 10，则摧毁其最强的近战单位。",
		activated: async card => { 
			tocar("leader", false);
			await ability_dict["scorch_c"].placed(card);
		},
		weight: (card, ai, max) => ai.weightScorchRow(card, max, "close")
	},
	francesca_beautiful: {
		description: "使己方所有远程单位的战力翻倍（若该排已有指挥官之角则无效）。",
		activated: async card => { 
			tocar("leader", false);
			await board.getRow(card, "ranged", card.holder).leaderHorn(card);
		},
		weight: (card, ai) => ai.weightHornRow(card, board.getRow(card, "ranged", card.holder))
	},
	francesca_daisy: {
		description: "战斗开始时额外抽一张牌。",
		placed: card => game.gameStart.push(() => {
			let draw = card.holder.deck.removeCard(0);
			tocar("leader", false);
			card.holder.hand.addCard(draw);
			return true;
		})
	},
	francesca_pureblood: {
		description: "从你的牌组中选择一张刺骨冰霜牌并立即打出。",
		activated: async card => {
			let out = card.holder.deck.findCard(c => c.key === "spe_frost");
			if (out) {
				tocar("leader", false);
				await out.autoplay(card.holder.deck);
			}
		},
		weight: (card, ai) => ai.weightWeatherFromDeck(card, "frost")
	},
	francesca_hope: {
		description: "将灵活单位移动到能最大化其战力的有效排（不要移动已在最佳排的单位）。",
		activated: async card => {
			let close = board.getRow(card, "close");
			let ranged =  board.getRow(card, "ranged");
			let cards = ability_dict["francesca_hope"].helper(card);
			tocar("leader", false);
			await Promise.all(cards.map(async p => await board.moveTo(p.card, p.row === close ? ranged : close, p.row)));
		},
		weight: card => {
			let cards = ability_dict["francesca_hope"].helper(card);
			return cards.reduce((a,c) => a + c.weight, 0);
		},
		helper: card => {
			let close = board.getRow(card, "close");
			let ranged = board.getRow(card, "ranged");
			return validCards(close).concat(validCards(ranged));
			
			function validCards(cont) {
				return cont.findCards(c => c.row === "agile").filter(c => dif(c,cont) > 0).map(c => ({
					card:c, row:cont, weight:dif(c,cont)
				}))
			}
			
			function dif(card, source) {
				return (source === close ? ranged : close).calcCardScore(card) - card.power;
			}
		}
	},
	crach_an_craite: {
		description: "将双方弃牌堆中的所有牌洗回其牌组。",
		activated: async card => {
			tocar("leader", false);
			Promise.all(card.holder.grave.cards.map(c => board.toDeck(c, card.holder.grave)));
			await Promise.all(card.holder.opponent().grave.cards.map(c => board.toDeck(c, card.holder.opponent().grave)));
		},
		weight: (card, ai, max, data) => {
			if (game.roundCount < 2) return 0;
			let medics = card.holder.hand.findCard(c => c.abilities.includes("medic"));
			if (medics !== undefined) return 0;
			let spies = card.holder.hand.findCard(c => c.abilities.includes("spy"));
			if (spies !== undefined) return 0;
			if (card.holder.hand.findCard(c => c.abilities.includes("decoy")) !== undefined && (data.medic.length || data.spy.length && card.holder.deck.findCard(c => c.abilities.includes("medic")) !== undefined)) return 0;
			return 15;
		}
	},
	king_bran: {
		description: "单位在恶劣天气下仅损失一半战力。",
		placed: card => {
			for (var i = 0; i < board.row.length; i++) {
				if ((card.holder === player_me && i > 2) || (card.holder === player_op && i < 3)) board.row[i].halfWeather = true;
			}
		}
	},
	queen_calanthe: {
		description: "打出一个单位，然后从你的牌组抽一张牌。",
		activated: async card => {
			let units = card.holder.hand.cards.filter(c => c.isUnit());
			if (units.length === 0) return;
			let wrapper = {
				card: null
			};
			if (card.holder.controller instanceof ControllerAI) wrapper.card = units[randomInt(units.length)];
			else await ui.queueCarousel(board.getRow(card, "hand", card.holder), 1, (c, i) => wrapper.card = c.cards[i], c => c.isUnit(), true);
			wrapper.card.autoplay();
			card.holder.hand.removeCard(wrapper.card);
			if (card.holder.deck.cards.length > 0) {
				tocar("leader", false);
				await card.holder.deck.draw(card.holder.hand);
			}
		},
		weight: (card, ai) => {
			let units = card.holder.hand.cards.filter(c => c.isUnit());
			if (units.length === 0) return 0;
			return 15;
		}
	},
	fake_ciri: {
		description: "从你手中弃置一张牌，然后从牌组抽两张牌。",
		activated: async card => {
			if (card.holder.hand.cards.length === 0) return;
			let hand = board.getRow(card, "hand", card.holder);
			if (card.holder.controller instanceof ControllerAI) {
				let cards = card.holder.controller.discardOrder(card).splice(0, 1).filter(c => c.basePower < 7);
				await Promise.all(cards.map(async c => await board.toGrave(c, card.holder.hand)));
			} else {
				try {
					Carousel.curr.exit();
				} catch (err) {}
				await ui.queueCarousel(hand, 1, (c, i) => board.toGrave(c.cards[i], c), () => true);
			}
			tocar("leader", false);
			for (let i = 0; i < 2; i++) {
				if (card.holder.deck.cards.length > 0) await card.holder.deck.draw(card.holder.hand);
			}
		},
		weight: (card, ai) => {
			if (card.holder.hand.cards.length === 0) return 0;
			return 15;
		}
	},
	radovid_stern: {
		description: "弃置 2 张牌，并从你的牌组中选择 1 张牌抽取。",
		activated: async (card) => {
			tocar("leader", false);
			let hand = board.getRow(card, "hand", card.holder);
			let deck = board.getRow(card, "deck", card.holder);
			
			if (!(card.holder.controller instanceof ControllerAI)) {
				if (!hand || hand.cards.length < 2) {
					tocar("menu_buy", false); 
					ui.enablePlayer(true);    
					return;                 
				}
			}

			if (card.holder.controller instanceof ControllerAI) {
				let cards = card.holder.controller.discardOrder(card).splice(0, 2).filter(c => c.basePower < 7);
				await Promise.all(cards.map(async c => await board.toGrave(c, card.holder.hand)));
				card.holder.deck.draw(card.holder.hand);
				return;
			} else {
				try {
					Carousel.curr.exit();
				} catch (err) { }
			}
			await ui.queueCarousel(hand, 2, (c, i) => board.toGrave(c.cards[i], c), () => true);
			await ui.queueCarousel(deck, 1, (c, i) => board.toHand(c.cards[i], deck), () => true, true);
		},
		weight: (card, ai) => {
			let cards = ai.discardOrder(card).splice(0, 2).filter(c => c.basePower < 7);
			if (cards.length < 2)
				return 0;
			return cards[0].abilities.includes("muster") ? 50 : 25;
		}
	},
	radovid_ruthless: {
		description: "取消本轮的焦炎技能。",
		activated: async card => {
			game.scorchCancelled = true;
			await ui.notification("north-scorch-cancelled", 1200);
			game.roundStart.push(async () => {
				game.scorchCancelled = false;
				return true;
			});
		}
	},
	vilgefortz_magician_kovir: {
		description: "使所有间谍牌的战力减半（对双方均有效）。",
		gameStart: () => game.spyPowerMult = 0.5
	},
	cosimo_malaspina: {
		description: "如果敌方所有近战单位的战力总和大于等于 10，则摧毁其最强的近战单位。",
		activated: async card => {
			tocar("leader", false);
			await ability_dict["scorch_c"].placed(card);
		},
		weight: (card, ai, max) => ai.weightScorchRow(card, max, "close")
	},
	resilience: {
		name: "坚韧",
		description: "如果己方场上还有另一个单位拥有相同技能，则本轮结束后该牌留在场上。",
		placed: async card => {
			game.roundEnd.push(async () => {
				if (card.isLocked()) return;
				let units = card.holder.getAllRowCards().filter(c => c.abilities.includes(card.abilities.at(-1)));
				if (units.length < 2) return;
				card.noRemove = true;
				await card.animate("resilience");
				game.roundStart.push(async () => {
					delete card.noRemove;
					let school = card.abilities.at(-1);
					if (!card.holder.effects["witchers"][school]) card.holder.effects["witchers"][school] = 0;
					card.holder.effects["witchers"][school]++;
					return true;
				});
			});
		}
	},
	witcher_wolf_school: {
		name: "狼学派猎魔人",
		description: "本学派的每个单位因本学派的每张卡牌而获得 +2 加成。",
		placed: async card => {
			let school = card.abilities.at(-1);
			if (!card.holder.effects["witchers"][school]) card.holder.effects["witchers"][school] = 0;
			card.holder.effects["witchers"][school]++;
		},
		removed: async card => {
			let school = card.abilities.at(-1);
			card.holder.effects["witchers"][school]--;
		}
	},
	witcher_viper_school: {
		name: "毒蛇学派猎魔人",
		description: "本学派的每个单位因本学派的每张卡牌而获得 +2 加成。",
		placed: async card => {
			let school = card.abilities.at(-1);
			if (!card.holder.effects["witchers"][school]) card.holder.effects["witchers"][school] = 0;
			card.holder.effects["witchers"][school]++;
		},
		removed: async card => {
			let school = card.abilities.at(-1);
			card.holder.effects["witchers"][school]--;
		}
	},
	witcher_bear_school: {
		name: "熊学派猎魔人",
		description: "本学派的每个单位因本学派的每张卡牌而获得 +2 加成。",
		placed: async card => {
			let school = card.abilities.at(-1);
			if (!card.holder.effects["witchers"][school]) card.holder.effects["witchers"][school] = 0;
			card.holder.effects["witchers"][school]++;
		},
		removed: async card => {
			let school = card.abilities.at(-1);
			card.holder.effects["witchers"][school]--;
		}
	},
	witcher_cat_school: {
		name: "猫学派猎魔人",
		description: "本学派的每个单位因本学派的每张卡牌而获得 +2 加成。",
		placed: async card => {
			let school = card.abilities.at(-1);
			if (!card.holder.effects["witchers"][school]) card.holder.effects["witchers"][school] = 0;
			card.holder.effects["witchers"][school]++;
		},
		removed: async card => {
			let school = card.abilities.at(-1);
			card.holder.effects["witchers"][school]--;
		}
	},
	witcher_griffin_school: {
		name: "狮鹫学派猎魔人",
		description: "本学派的每个单位因本学派的每张卡牌而获得 +2 加成。",
		placed: async card => {
			let school = card.abilities.at(-1);
			if (!card.holder.effects["witchers"][school]) card.holder.effects["witchers"][school] = 0;
			card.holder.effects["witchers"][school]++;
		},
		removed: async card => {
			let school = card.abilities.at(-1);
			card.holder.effects["witchers"][school]--;
		}
	},
	shield: {
		name: "护盾",
		description: "保护该排单位免受所有技能影响（天气效果除外）。",
		weight: (card) => 30
	},
	seize: {
		name: "夺取",
		description: "将己方战场上战力最低的近战单位移动到己方（其技能将不再生效）。",
		activated: async card => {
			let opCloseRow = board.getRow(card, "close", card.holder.opponent());
			let meCloseRow = board.getRow(card, "close", card.holder);
			if (opCloseRow.isShielded()) return;
			let units = opCloseRow.minUnits();
			if (units.length === 0) return;
			await Promise.all(units.map(async c => await c.animate("seize")));
			units.forEach(async c => {
				c.holder = card.holder;
				await board.moveToNoEffects(c, meCloseRow, opCloseRow);
			});
			await board.toGrave(card, card.holder.hand);
		},
		weight: (card) => {
			if (card.holder.opponent().getAllRows()[0].isShielded()) return 0;
			return card.holder.opponent().getAllRows()[0].minUnits().reduce((a, c) => a + c.power, 0) * 2
		}
	},
	lock: {
		name: "锁定",
		description: "锁定/取消该排下一个打出的单位技能（对无技能单位和英雄无效）。",
		weight: (card) => 20
	},
	knockback: {
		name: "击退",
		description: "将所选排（近战或远程）的所有单位推向攻城排方向，无视护盾。",
		activated: async (card, row) => {
			let units = row.findCards(c => c.isUnit());
			if (units.length > 0) {
				let targetRow;
				for (var i = 0; i < board.row.length; i++) {
					if (board.row[i] === row) {
						if (i < 3) targetRow = board.row[Math.max(0, i - 1)];
						else targetRow = board.row[Math.min(5, i + 1)];
					}
				}
				await Promise.all(units.map(async c => await c.animate("knockback")));
				units.map(async c => {
					if (c.abilities.includes("bond") || c.abilities.includes("morale") || c.abilities.includes("horn")) await board.moveTo(c, targetRow, row);
					else await board.moveToNoEffects(c, targetRow, row);
				});
			}
			await board.toGrave(card, card.holder.hand);
		},
		weight: (card) => {
			if (board.getRow(card, "close", card.holder.opponent()).cards.length + board.getRow(card, "ranged", card.holder.opponent()).cards.length === 0) return 0;
			let score = 0;
			if (board.getRow(card, "close", card.holder.opponent()).cards.length > 0 && (
					board.getRow(card, "close", card.holder.opponent()).effects.horn > 0 ||
					board.getRow(card, "ranged", card.holder.opponent()).effects.weather ||
					Object.keys(board.getRow(card, "close", card.holder.opponent()).effects.bond).length > 1 ||
					board.getRow(card, "close", card.holder.opponent()).isShielded()
				)
			) score = Math.floor(board.getRow(card, "close", card.holder.opponent()).cards.filter(c => c.isUnit()).reduce((a, c) => a + c.power, 0) * 0.5);
			if (board.getRow(card, "ranged", card.holder.opponent()).cards.length > 0 && (
					board.getRow(card, "ranged", card.holder.opponent()).effects.horn > 0 ||
					board.getRow(card, "siege", card.holder.opponent()).effects.weather ||
					Object.keys(board.getRow(card, "ranged", card.holder.opponent()).effects.bond).length > 1 ||
					board.getRow(card, "ranged", card.holder.opponent()).isShielded()
				)
			) score = Math.floor(board.getRow(card, "close", card.holder.opponent()).cards.filter(c => c.isUnit()).reduce((a, c) => a + c.power, 0) * 0.5);
			return Math.max(1, score);
		}
	},
	alzur_maker: {
		description: "摧毁己方场上的一个单位，并召唤一只科什切伊。",
		activated: (card, player) => {
			player.endTurnAfterAbilityUse = false;
			ui.showPreviewVisuals(card);
			ui.enablePlayer(true);
			if(!(player.controller instanceof ControllerAI)) {
				ui.setSelectable(card, true);
			}
			tocar("leader", false);
		},
		target: "wu_koshchey",
		weight: (card, ai, max) => {
			if (ai.player.getAllRowCards().filter(c => c.isUnit()).length === 0) return 0;
			return ai.weightScorchRow(card, max, "close");
		}
	},
	vilgefortz_sorcerer: {
		description: "清除场上所有天气效果。",
		activated: async () => {
			let cineOverlay = document.createElement("div");
			cineOverlay.className = "sunlight-overlay-cinema";
			let solarBeam = document.createElement("div");
			solarBeam.className = "sunlight-beam-wave";
			cineOverlay.appendChild(solarBeam);
			document.body.appendChild(cineOverlay);
			setTimeout(() => {
				if (cineOverlay) cineOverlay.remove();
			}, 2000);
			tocar("leader", false);
			await weather.clearWeather()
		},
		weight: (card, ai) => ai.weightCard(card_dict["spe_clear"])
	},
	anna_henrietta_duchess: {
		description: "摧毁对手任意一排上的一张指挥官之角。",
		activated: (card, player) => {
			player.endTurnAfterAbilityUse = false;
			ui.showPreviewVisuals(card);
			ui.enablePlayer(true);
			if (!(player.controller instanceof ControllerAI)) {
				ui.setSelectable(card, true);
			}
			tocar("leader", false);
		},
		weight: (card, ai) => {
			let horns = card.holder.opponent().getAllRows().filter(r => r.special.findCards(c => c.abilities.includes("horn")).length > 0).sort((a, b) => b.total - a.total);
			if (horns.length === 0) return 0;
			return horns[0].total;
		}
	},
	toussaint_wine: {
		name: "陶森特葡萄酒",
		description: "放置在近战或远程排，使所选排所有单位获得 +2 加成。每排限一张。",
		placed: async card => await card.animate("morale")
	},
	anna_henrietta_ladyship: {
		description: "从你的弃牌堆中复活一个单位并立即打出。",
		activated: async card => {
			let newCard;
			if (card.holder.controller instanceof ControllerAI) newCard = card.holder.controller.medic(card, card.holder.grave);
			else {
				try {
					Carousel.curr.exit();
				} catch (err) {}
				await ui.queueCarousel(card.holder.grave, 1, (c, i) => newCard = c.cards[i], c => c.isUnit(), false, false);
			}
			if (newCard) {
				tocar("leader", false);
				await newCard.autoplay(card.holder.grave);
			}
		},
		weight: (card, ai, max, data) => ai.weightMedic(data, 0, card.holder)
	},
	anna_henrietta_grace: {
		description: "取消本轮诱饵技能。",
		activated: async card => {
			game.decoyCancelled = true;
			await ui.notification("toussaint-decoy-cancelled", 1200);
			game.roundStart.push(async () => {
				game.decoyCancelled = false;
				return true;
			});
		},
		weight: (card) => game.decoyCancelled ? 0 : 10
	},
	meve_princess: {
		description: "如果对手某排的总战力大于等于 10，则摧毁该排最强的卡牌（仅影响对手战场）。",
		activated: async (card, player) => {
			player.endTurnAfterAbilityUse = false;
			ui.showPreviewVisuals(card);
			ui.enablePlayer(true);
			if (!(player.controller instanceof ControllerAI)) {
				ui.setSelectable(card, true);
			}
			tocar("leader", false);
		},
		weight: (card, ai, max) => {
			return Math.max(ai.weightScorchRow(card, max, "close"), ai.weightScorchRow(card, max, "ranged"), ai.weightScorchRow(card, max, "siege"));
		}
	},
	shield_c: {
		name: "近战护盾",
		description: "保护近战排单位免受所有技能影响（天气效果除外）。",
		weight: (card) => 20
	},
	shield_r: {
		name: "远程护盾",
		description: "保护远程排单位免受所有技能影响（天气效果除外）。",
		weight: (card) => 20
	},
	shield_s: {
		name: "攻城护盾",
		description: "保护攻城排单位免受所有技能影响（天气效果除外）。",
		weight: (card) => 20
	},
	meve_white_queen: {
		description: "所有医疗兵牌可以从弃牌堆中选择两张单位牌（对双方均有效）。",
		gameStart: () => game.medicCount = 2
	},
	carlo_varese: {
		description: "如果对手某排的总战力大于等于 10，则摧毁该排最强的卡牌（仅影响对手战场）。",
		activated: async (card, player) => {
			player.endTurnAfterAbilityUse = false;
			ui.showPreviewVisuals(card);
			ui.enablePlayer(true);
			if (!(player.controller instanceof ControllerAI)) {
				ui.setSelectable(card, true);
			}
			tocar("leader", false);
		},
		weight: (card, ai, max) => {
			return Math.max(ai.weightScorchRow(card, max, "close"), ai.weightScorchRow(card, max, "ranged"), ai.weightScorchRow(card, max, "siege"));
		}
	},
	francis_bedlam: {
		description: "将所有间谍单位牌送至其所在方的弃牌堆。",
		activated: async (card, player) => {
			let op_spies = card.holder.opponent().getAllRowCards().filter(c => c.isUnit() && c.abilities.includes("spy"));
			let me_spies = card.holder.getAllRowCards().filter(c => c.isUnit() && c.abilities.includes("spy"));
			tocar("leader", false);
			await op_spies.map(async c => await board.toGrave(c, c.currentLocation));
			await me_spies.map(async c => await board.toGrave(c, c.currentLocation));
		},
		weight: (card, ai, max) => {
			let op_spies = card.holder.opponent().getAllRowCards().filter(c => c.isUnit() && c.abilities.includes("spy")).reduce((a,c) => a + c.power,0);
			let me_spies = card.holder.getAllRowCards().filter(c => c.isUnit() && c.abilities.includes("spy")).reduce((a, c) => a + c.power,0);
			return Math.max(0, op_spies - me_spies);
		}
	},
	cyprian_wiley: {
		description: "夺取对手近战排中战力最低的单位。",
		activated: async card => {
			let opCloseRow = board.getRow(card, "close", card.holder.opponent());
			let meCloseRow = board.getRow(card, "close", card.holder);
			if (opCloseRow.isShielded()) return;
			let units = opCloseRow.minUnits();
			if (units.length === 0) return;
			tocar("leader", false);
			await Promise.all(units.map(async c => await c.animate("seize")));
			units.forEach(async c => {
				c.holder = card.holder;
				await board.moveToNoEffects(c, meCloseRow, opCloseRow);
			});
		},
		weight: (card) => {
			if (card.holder.opponent().getAllRows()[0].isShielded()) return 0;
			return card.holder.opponent().getAllRows()[0].minUnits().reduce((a, c) => a + c.power, 0) * 2
		}
	},
	gudrun_bjornsdottir: {
		description: "召唤弗林德船队。",
		activated: async (card, player) => {
			let new_card = new Card("sy_flyndr_crew", card_dict["sy_flyndr_crew"], player);
			tocar("leader", false);
			await board.addCardToRow(new_card, new_card.row, card.holder);
		},
		weight: (card, ai, max) => {
			return card.holder.getAllRows()[0].cards.length + Number(card_dict["sy_flyndr_crew"]["strength"]);
		}
	},
	cyrus_hemmelfart: {
		description: "在对手任意一排上打出一张二聚魔法镣铐牌。",
		activated: async (card, player) => {
			player.endTurnAfterAbilityUse = false;
			ui.showPreviewVisuals(card);
			ui.enablePlayer(true);
			if (!(player.controller instanceof ControllerAI)) {
				ui.setSelectable(card, true);
			}
			tocar("leader", false);
		},
		weight: (card) => 20
	},
	azar_javed: {
		description: "摧毁敌方最弱的英雄牌（最多 1 张）。",
		activated: async (card, player) => {
			let heroes = player.opponent().getAllRowCards().filter(c => c.hero);
			if (heroes.length === 0) return;
			let target = heroes.sort((a, b) => a.power - b.power)[0];
			tocar("leader", false);			
			await target.animate("scorch", true, false);
			await board.toGrave(target, target.currentLocation);
		},
		weight: (card, ai, max) => {
			let heroes = card.holder.opponent().getAllRowCards().filter(c => c.hero);
			if (heroes.length === 0) return 0;
			return heroes.sort((a, b) => a.power - b.power)[0].power;
		}
	},
	bank: {
		name: "银行",
		description: "从你的牌组中抽一张牌。",
		activated: async card => {
			card.holder.deck.draw(card.holder.hand);
			await board.toGrave(card, card.holder.hand);
		},
		weight: (card) => 20
	},
	witch_hunt: {
		name: "猎巫",
		description: "摧毁对面排上最弱的单位。",
		placed: async card => {
			let row = card.currentLocation.getOppositeRow();
			if (row.isShielded() || game.scorchCancelled) return;
			let units = row.minUnits();
			await Promise.all(units.map(async c => await c.animate("scorch", true, false)));
			await Promise.all(units.map(async c => await board.toGrave(c, row)));
		}
	},
	zerrikanterment: {
		description: "朝拜者加成翻倍。",
		gameStart: () => game.whorshipBoost *= 2
	},
	baal_zebuth: {
		description: "从对手的弃牌堆中选择 2 张牌并洗回其牌组。",
		activated: async (card) => {
			tocar("leader", false);
			let grave = card.holder.opponent().grave;
			if (card.holder.controller instanceof ControllerAI) {
				let cards = grave.findCardsRandom(false,2);
				await Promise.all(cards.map(async c => await board.toDeck(c, c.holder.grave)));
				return;
			} else {
				try {
					Carousel.curr.exit();
				} catch (err) {}
			}
			await ui.queueCarousel(grave, 2, (c, i) => board.toDeck(c.cards[i], c), () => true);
		},
		weight: (card) => {
			if (card.holder.opponent().grave.cards.length < 5) return 0;
			else return 20;
		}
	},
	rarog: {
		description: "从弃牌堆中随机抽一张牌到手牌（任意牌），然后将其余的牌洗回牌组。",
		activated: async (card) => {
			if (card.holder.grave.cards.length === 0) return;
			let grave = card.holder.grave;
			let c = grave.findCardsRandom(false, 1)[0];
			tocar("leader", false);
			await board.toHand(c, c.holder.grave);
			Promise.all(card.holder.grave.cards.map(c => board.toDeck(c, card.holder.grave)));
		},
		weight: (card) => {
			let medics = card.holder.hand.cards.filter(c => c.abilities.includes("medic"));
			if (medics.length > 0 || card.holder.grave.cards.length == 0) return 0;
			else return 15;
		}
	},
	whorshipper: {
		name: "朝拜者",
		description: "为场上所有被朝拜单位提供 +1 加成。",
		placed: async card => {
			if (card.isLocked()) return;
			card.holder.effects["whorshippers"]++;
		},
		removed: async card => {
			if (card.isLocked()) return;
			card.holder.effects["whorshippers"]--;
		},
		weight: (card) => {
			let wcards = card.holder.getAllRowCards().filter(c => c.abilities.includes("whorshipped"));
			return wcards.length * game.whorshipBoost;
		}
	},
	whorshipped: {
		name: "被朝拜",
		description: "因场上的所有朝拜者而获得 +1 加成。",
	},
	inspire: {
		name: "激励",
		description: "己方场上所有拥有激励技能的单位将取其最高基础战力。仍然受天气影响。",
	},
};