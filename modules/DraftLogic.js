export class DraftLogic {
    constructor(gameState, heroes, teamStrategies) {
        this.gameState = gameState;
        this.heroes = heroes;
        this.teamStrategies = teamStrategies;
    }

    findHeroById(heroId) {
        return this.heroes.find(hero => hero.id === heroId);
    }

    findHeroByName(name) {
        return this.heroes.find(hero =>
            hero.name.toLowerCase() === name.toLowerCase()
        );
    }

    getTeamComposition(picks) {
        const composition = {
            Tank: 0,
            Fighter: 0,
            Assassin: 0,
            Mage: 0,
            Marksman: 0,
            Support: 0
        };

        picks.forEach(heroId => {
            const hero = this.findHeroById(heroId);
            if (hero) {
                composition[hero.role]++;
            }
        });

        return composition;
    }

    getMissingRoles(picks) {
        const strategy = this.teamStrategies[this.gameState.selectedEnemy];
        const composition = picks.map(id => this.findHeroById(id));
        const roles = {
            jungler: false,
            midlane: false,
            exp: false,
            roam: false,
            gold: false
        };

        // Check which roles are filled
        picks.forEach(heroId => {
            const hero = this.findHeroById(heroId);
            for (const [role, heroes] of Object.entries(strategy.rolePreference)) {
                if (heroes.includes(hero.name) && !roles[role]) {
                    roles[role] = true;
                    break;
                }
            }
        });

        return Object.entries(roles)
            .filter(([role, filled]) => !filled)
            .map(([role]) => role);
    }

    calculateTeamStats(picks) {
        const heroes = picks.map(heroId => this.findHeroById(heroId));
        
        const totalStats = heroes.reduce((acc, hero) => {
            acc.damage += hero.damage;
            acc.durability += hero.durability;
            acc.cc += hero.cc;
            return acc;
        }, { damage: 0, durability: 0, cc: 0 });

        // Calculate average and ensure it doesn't exceed 10
        return {
            damage: Math.min(10, totalStats.damage / heroes.length),
            durability: Math.min(10, totalStats.durability / heroes.length),
            cc: Math.min(10, totalStats.cc / heroes.length)
        };
    }

    getAIBanSelection(strategy) {
        const availableHeroes = this.heroes.filter(hero =>
            this.gameState.isHeroAvailable(hero.id)
        );

        // First phase bans - target meta heroes
        if (this.gameState.enemyBans.length < 3) {
            for (const banName of strategy.commonBans) {
                const hero = this.findHeroByName(banName);
                if (hero && this.gameState.isHeroAvailable(hero.id)) {
                    return hero.id;
                }
            }
        }

        // Second phase bans - counter enemy picks
        const playerPicks = this.gameState.playerPicks.map(id => this.findHeroById(id));
        const counterBans = availableHeroes.filter(hero => {
            return this.isStrongAgainst(hero, playerPicks) && 
                   strategy.preferredPicks.includes(hero.name);
        });

        if (counterBans.length > 0) {
            return this.getRandomHero(counterBans).id;
        }

        // Default to banning strong heroes
        const strongHeroes = availableHeroes.filter(hero =>
            strategy.preferredPicks.includes(hero.name)
        );
        return this.getRandomHero(strongHeroes || availableHeroes).id;
    }

    getAIPickSelection(strategy) {
        const availableHeroes = this.heroes.filter(hero =>
            this.gameState.isHeroAvailable(hero.id)
        );

        // Get current enemy team composition
        const currentPicks = this.gameState.enemyPicks.map(id => this.findHeroById(id));
        const currentRoles = currentPicks.map(hero => hero.role);
        
        // Define priority roles and their corresponding strong heroes
        const priorityRoles = {
            Marksman: ['Beatrix', 'Brody', 'Claude', 'Bruno', 'Karrie','Harith', 'Moskov'],
            Tank: ['Grock', 'Kaja', 'Khufra', 'Franco', 'Tigreal', 'Chou', 'Hylos', 'Gatot Kaca', 'Arlott', 'Chip'],
            Mage: ['Kagura', 'Lylia', 'Lunox', 'Yve', 'Aurora', 'Vexana', 'Luo Yi', 'Novaria', 'Nana', 'Faramis'],
            Fighter: ['Paquito', 'Yu Zhong', 'Khaleed', 'X.Borg', 'Thamuz', 'Arlott', 'Hylos', 'Gatot Kaca', 'Grock'],
            Assassin: ['Lancelot', 'Ling', 'Hayabusa', 'Gusion', 'Suyou', 'Fanny', 'Fredrinn', 'Alpha'],
            Support: ['Angela', 'Estes', 'Rafaela', 'Mathilda', 'Diggie', 'Carmilla']
        };

        // First pick priority - secure a strong marksman if available
        if (this.gameState.enemyPicks.length === 0) {
            const strongMarksman = availableHeroes.find(hero => 
                hero.role === 'Marksman' && priorityRoles.Marksman.includes(hero.name)
            );
            if (strongMarksman) return strongMarksman.id;
        }

        // Determine missing core roles
        const missingRoles = [];
        if (!currentRoles.includes('Marksman')) missingRoles.push('Marksman');
        if (!currentRoles.includes('Tank') && !currentRoles.includes('Support')) missingRoles.push('Tank');
        if (!currentRoles.includes('Mage')) missingRoles.push('Mage');
        if (!currentRoles.includes('Fighter')) missingRoles.push('Fighter');
        if (!currentRoles.includes('Assassin')) missingRoles.push('Assassin');

        // If we have missing roles, prioritize filling them with strong heroes
        if (missingRoles.length > 0) {
            for (const role of missingRoles) {
                const strongHeroesInRole = availableHeroes.filter(hero =>
                    hero.role === role && priorityRoles[role].includes(hero.name)
                );
                
                if (strongHeroesInRole.length > 0) {
                    return this.getRandomHero(strongHeroesInRole).id;
                }
            }
        }

        // Counter-picking logic
        const playerPicks = this.gameState.playerPicks.map(id => this.findHeroById(id));
        const counterPicks = availableHeroes.filter(hero =>
            this.isStrongAgainst(hero, playerPicks) &&
            !currentRoles.includes(hero.role) &&
            priorityRoles[hero.role].includes(hero.name)
        );

        if (counterPicks.length > 0) {
            return this.getRandomHero(counterPicks).id;
        }

        // Enhanced role balance check
        const teamStats = this.calculateTeamStats(this.gameState.enemyPicks);
        if (teamStats.damage < 6 && !currentRoles.includes('Marksman')) {
            const damageDealer = availableHeroes.find(hero => 
                (hero.role === 'Marksman' || hero.role === 'Mage') && 
                hero.damage >= 7
            );
            if (damageDealer) return damageDealer.id;
        }

        if (teamStats.durability < 6 && !currentRoles.includes('Tank')) {
            const tank = availableHeroes.find(hero => 
                hero.role === 'Tank' && hero.durability >= 7
            );
            if (tank) return tank.id;
        }

        // Fallback to any available strong hero from priority roles
        const allStrongHeroes = availableHeroes.filter(hero =>
            priorityRoles[hero.role]?.includes(hero.name)
        );

        if (allStrongHeroes.length > 0) {
            return this.getRandomHero(allStrongHeroes).id;
        }

        // Last resort - pick any available hero
        return this.getRandomHero(availableHeroes).id;
    }

    isStrongAgainst(hero, enemyHeroes) {
        // Enhanced counter logic
        const counters = {
            Assassin: ['Marksman', 'Mage'],
            Tank: ['Assassin', 'Fighter'],
            Marksman: ['Tank', 'Fighter'],
            Mage: ['Fighter', 'Support'],
            Fighter: ['Tank', 'Support'],
            Support: ['Assassin', 'Mage']
        };

        return enemyHeroes.some(enemy => 
            counters[hero.role]?.includes(enemy.role) &&
            hero.damage >= 7
        );
    }

    countersPlaystyle(hero, playstyle) {
        if (playstyle === 'aggressive' && (hero.role === 'Tank' || hero.role === 'Support')) {
            return true;
        }
        if (playstyle === 'defensive' && (hero.role === 'Assassin' || hero.damage > 8)) {
            return true;
        }
        return false;
    }

    fitsTeamComposition(hero, composition, strategy) {
        const roleCount = composition[hero.role] || 0;
        if (roleCount >= 2) return false;

        if (strategy.lateGameFocus && (hero.role === 'Marksman' || hero.role === 'Mage')) {
            return true;
        }
        if (!strategy.lateGameFocus && (hero.role === 'Assassin' || hero.role === 'Fighter')) {
            return true;
        }

        return roleCount === 0;
    }

    getTeamNeeds(composition, strategy) {
        const needs = [];
        if (!composition['Tank']) needs.push('Tank');
        if (!composition['Support']) needs.push('Support');
        if (!composition['Marksman'] && !composition['Mage']) needs.push('Marksman', 'Mage');
        if (strategy.lateGameFocus && !composition['Marksman']) needs.push('Marksman');
        if (!strategy.lateGameFocus && !composition['Assassin']) needs.push('Assassin');
        return needs;
    }

    fitsPlaystyle(hero, playstyle) {
        if (playstyle === 'aggressive' && (hero.damage > 7 || hero.cc > 7)) {
            return true;
        }
        if (playstyle === 'defensive' && (hero.durability > 7 || hero.cc > 7)) {
            return true;
        }
        return false;
    }

    getRandomHero(heroes) {
        if (!heroes || heroes.length === 0) return null;
        return heroes[Math.floor(Math.random() * heroes.length)];
    }

    processPlayerSelection(heroId) {
        if (!this.gameState.canSelectHero()) return false;
        if (!this.gameState.isHeroAvailable(heroId)) return false;

        if (this.gameState.phase === 'ban' && this.gameState.playerBans.length < 5) {
            this.gameState.playerBans.push(heroId);
            this.gameState.currentTurn = 'enemy';
            return true;
        } else if (this.gameState.phase === 'pick' && this.gameState.playerPicks.length < 5) {
            this.gameState.playerPicks.push(heroId);
            this.gameState.currentTurn = 'enemy';
            return true;
        }
        return false;
    }

    processAITurn() {
        const strategy = this.teamStrategies[this.gameState.selectedEnemy];
        let selectedId;

        if (this.gameState.phase === 'ban') {
            selectedId = this.getAIBanSelection(strategy);
            this.gameState.enemyBans.push(selectedId);

            if (this.gameState.playerBans.length === 5 && this.gameState.enemyBans.length === 5) {
                this.gameState.phase = 'pick';
            }
        } else if (this.gameState.phase === 'pick') {
            selectedId = this.getAIPickSelection(strategy);
            this.gameState.enemyPicks.push(selectedId);
        }

        this.gameState.currentTurn = 'player';
        this.gameState.turnCount++;
        return selectedId;
    }

    evaluateDraft() {
        const playerStats = this.calculateTeamStats(this.gameState.playerPicks);
        const enemyStats = this.calculateTeamStats(this.gameState.enemyPicks);

        const playerTotal = Object.values(playerStats).reduce((a, b) => a + b, 0);
        const enemyTotal = Object.values(enemyStats).reduce((a, b) => a + b, 0);

        return {
            winner: playerTotal > enemyTotal ? 'player' : 'enemy',
            advantage: Math.abs(playerTotal - enemyTotal) / 3, // Average difference per category
            playerStats,
            enemyStats,
            analysis: this.generateAnalysis(playerStats, enemyStats)
        };
    }

    generateAnalysis(playerStats, enemyStats) {
        let analysis = [];

        if (playerStats.damage > enemyStats.damage) {
            analysis.push("Your team has higher damage potential. Look for opportunities to engage in teamfights.");
        } else {
            analysis.push("Enemy team has higher damage output. Be cautious in extended fights.");
        }

        if (playerStats.durability > enemyStats.durability) {
            analysis.push("Your team is more durable. You can withstand more damage in teamfights.");
        } else {
            analysis.push("Enemy team is more durable. Consider building defensive items.");
        }

        if (playerStats.cc > enemyStats.cc) {
            analysis.push("Your team has better crowd control. Coordinate your CC abilities for maximum impact.");
        } else {
            analysis.push("Enemy team has stronger CC. Be prepared to dodge or use purify against their control abilities.");
        }

        return analysis;
    }
}
