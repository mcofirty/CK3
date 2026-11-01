/**
 * Toutes les constantes d'équilibrage. Aucun nombre d'équilibrage n'est écrit en dur dans le moteur.
 */
export const BALANCE = {
  game: {
    startYear: 1066,
    maxYears: 150,
    seasonsPerYear: 4,
    maxEventsPerSeason: 3,
    /** Probabilité qu'un événement aléatoire soit tiré à chaque emplacement (0 à 3 par saison). */
    eventSlotChance: 0.45,
    truceSeasons: 12,
  },

  battle: {
    maxRounds: 8,
    /** k : constante de calibrage des pertes. */
    k: 0.1,
    moraleLossFactor: 150,
    randomMin: 0.85,
    randomMax: 1.15,
    commanderPerPoint: 0.02,
    commanderBase: 10,
    companySize: 100,
    sovereignMorale: 10,
    winterMorale: -10,
    rainChance: 0.2,
    rainArchers: 0.7,
    breakMorale: 0,
    breakMenRatio: 0.2,
    breakFleeLosses: 0.1,
    shockNeighborBroken: 15,
    shockCommanderLost: 25,
    reserveBonusMorale: 10,
    withdrawMorale: -10,
    flankMorale: 10,
    ambushMorale: 15,
    pursuitBase: 0.05,
    pursuitCavalry: 0.4,
    pursuitCap: 0.3,
    orders: {
      charge: { attack: 1.3, cavalryAttack: 1.5, defense: 0.85 },
      chargeImpetueux: { attack: 1.5, cavalryAttack: 1.7 },
      hold: { attack: 0.7, defense: 1.4, prudentDefense: 1.55, moraleLoss: 0.75 },
      shoot: { archerAttack: 1.2, archerDefenseVsCharge: 0.8, volleys: 3 },
      feint: {
        minCavalry: 0.4,
        minGuerre: 12,
        chargerLosses: 1.5,
        chargerMorale: 20,
        failMorale: 10,
        idleAttack: 0.6,
      },
      flank: { attack: 1.5 },
      pikeWallMinShare: 0.3,
      pikeWallCavalryLosses: 1.5,
    },
    traits: {
      cavalierCavalry: 1.1,
      inebranlableMaxLoss: 20,
      inspirantRally: 25,
      lacheThreshold: 30,
      lacheChance: 0.5,
      lacheMorale: 15,
    },
    risks: {
      wound: 0.02,
      woundBroken: 0.08,
      mortal: 0.2,
      capture: 0.25,
    },
    ai: {
      randomOrders: { facile: 0.3, normal: 0.1, difficile: 0 },
      chargeRatio: 1.3,
      holdVsCavalryShare: 0.4,
      lowMorale: 25,
      shootArcherShare: 0.4,
    },
    /** Score de guerre d'une bataille gagnée : min + (max-min) × min(1, engagés / menForMax). */
    warScore: { min: 5, max: 25, menForMax: 4000 },
    prestigeWin: 20,
    renownWin: 5,
    /** Tactiques en main au début d'une bataille (hors talents). */
    tacticHand: 3,
    /** Élan : un camp qui inflige ×ratio les pertes subies gagne un niveau (max). */
    elan: { ratio: 1.5, max: 3, attackPerLevel: 0.015 },
    weather: {
      fogChance: 0.12,
      snowChanceWinter: 0.5,
      fogArchers: 0.75,
      snowCavalry: 0.8,
      snowMorale: -5,
    },
    duel: {
      chance: 0.25,
      randomMax: 10,
      winnerMorale: 10,
      loserMorale: 10,
      refuseMorale: 10,
      woundChance: 0.35,
      deathChance: 0.12,
      prestige: 60,
    },
    incidentChance: 0.12,
    incidentMorale: 10,
    boucherMorale: 5,
  },

  progression: {
    /** Expérience par point de talent. */
    xpPerPoint: 100,
    /** Expérience par saison pour un adulte (dans sa meilleure compétence). */
    seasonXp: 4,
    rulerSeasonXp: 3,
    councilXp: 4,
    battleXp: 25,
    battleWinXp: 20,
    plotXp: 30,
    buildXp: 12,
    marriageXp: 15,
    legacyCost: [120, 280, 520],
    renownBase: 0.4,
    renownPerCounty: 0.08,
    renownCap: 2.5,
  },

  stress: {
    decay: 3,
    tense: 50,
    overwhelmed: 75,
    crisis: 100,
    healthLoss: 1,
    ambitionFail: 25,
  },

  ambitions: {
    rewardXp: 100,
    failPrestige: -50,
  },

  relations: {
    /** Chance par saison qu'une relation naisse à la cour du joueur. */
    formChance: 0.06,
    loverOpinion: 40,
    memoryKill: -50,
    memoryKillSeasons: 160,
    memoryPrison: -25,
    vengeanceChance: 0.08,
  },

  hostage: {
    truceSeasons: 16,
    executeStress: { juste: 25, genereux: 20, courtois: 10, '*': 5, cruel: -10 },
    executePrestige: -10,
    executeVassalOpinion: -5,
    opinionPerSeason: 1,
    offerAfter: 8,
    offerGold: 120,
  },

  siege: {
    negotiateBase: 0.25,
    negotiatePerDiplo: 0.03,
    negotiatePerProgress: 0.1,
    negotiatePerFort: -0.08,
    negotiateGold: 50,
    negotiateFailPrestige: -15,
    blockadeAttrition: 0.7,
  },

  mercenaries: {
    contractSeasons: 8,
    cooldownSeasons: 8,
  },

  plague: {
    worldChance: 0.006,
    duration: 6,
    spreadChance: 0.3,
    immunity: 40,
    developmentLoss: 0.15,
    levyLoss: 0.4,
    sicknessChance: 0.06,
  },

  events: {
    /** Effet d'une compétence sur une issue incertaine, par point autour de 10. */
    skillChancePerPoint: 0.025,
    chanceMin: 0.05,
    chanceMax: 0.95,
    /** Bataille d'événement : part des levées mobilisées d'urgence. */
    emergencyLevies: 0.7,
    militia: 300,
  },

  characters: {
    adulthood: 16,
    maxSkill: 20,
    /** Plafond avec traits et talents. */
    skillCap: 25,
    hereditaryChance: 0.25,
    /** Risque de décès par saison : base + âge et santé. */
    deathBase: 0.001,
    deathAgeStart: 45,
    deathAgePerYear: 0.0025,
    deathLowHealth: 0.05,
    deathHealthThreshold: 30,
    childDeath: 0.004,
    healthDecayAfter: 50,
    healthDecayPerYear: 2,
    healthRegen: 1,
    birthChance: 0.14,
    birthFertileUntil: 45,
    birthAgeDecline: 0.006,
    maxChildren: 7,
    womanFertileUntil: 42,
    traitsAtStart: 2,
    sicknessChance: 0.01,
    recoverChance: 0.15,
    woundRecoverChance: 0.08,
    scarChance: 0.3,
    educationTier2Skill: 12,
    educationSkillGain: 0.35,
    renownPerTitle: { duche: 2, royaume: 6 },
    marriageRenown: 15,
    primogenitureCost: 400,
    courtSize: 4,
  },

  opinion: {
    min: -100,
    max: 100,
    diplomacyPerPoint: 1,
    sameTrait: 10,
    oppositeTrait: -10,
    family: 15,
    spouse: 25,
    friend: 30,
    rival: -40,
    overDemesne: -10,
    factionThreshold: -30,
    vassalBase: 5,
    rivalRulerBase: -10,
    claimOnHolding: -15,
    atWar: -40,
    allied: 25,
    newLiege: -10,
    decayPerSeason: 1,
  },

  economy: {
    incomePerDevelopment: 1.2,
    gestionIncomeBonus: 0.02,
    vassalTaxRate: 0.3,
    vassalLevyRate: 0.5,
    /** Contribution = taux × clamp(base + opinion × facteur, min, max). */
    vassalContribBase: 0.75,
    vassalContribPerOpinion: 0.006,
    vassalContribMin: 0.1,
    vassalContribMax: 1.2,
    overDemesneIncome: 0.75,
    demesneBase: 3,
    demesnePerGestion: 5,
    leviesPerDevelopment: 60,
    leviesBase: 120,
    levyRegen: 0.15,
    devGrowthBase: 0.01,
    devGrowthPerSavoir: 0.0015,
    developmentMax: 10,
    piety: { base: 0.5, perSavoir: 0.08 },
    prestige: { base: 0.5, perTitle: 0.6, perKingdom: 3, perDuchy: 1 },
    aiIncomeMultiplier: { facile: 0.8, normal: 1, difficile: 1.15 },
    giftCost: 50,
    giftOpinion: 25,
    debtThreshold: -100,
    debtOpinion: -1,
    titleBaseSlots: { min: 2, max: 3 },
    /** Revenu net minimal d'un souverain au départ : les compagnies de trop sont retirées. */
    startNetFloor: 4,
  },

  /** Économie locale : impôts, contentement, conscription, emprunts. */
  local: {
    /** Contentement de départ et point d'équilibre vers lequel il revient. */
    contentmentStart: 60,
    contentmentRest: 55,
    contentmentReturn: 0.06,
    taxes: {
      faible: { income: 0.7, contentment: 3, levies: 1.05 },
      normal: { income: 1, contentment: 0, levies: 1 },
      eleve: { income: 1.3, contentment: -3, levies: 0.95 },
      ecrasant: { income: 1.65, contentment: -7, levies: 0.85 },
    },
    conscription: {
      legere: { levies: 0.7, contentment: 1, development: 1.1 },
      normale: { levies: 1, contentment: 0, development: 1 },
      lourde: { levies: 1.4, contentment: -3, development: 0.75 },
    },
    /** Effet du contentement (0 à 100) : multiplicateur min + (max-min) × contentement/100. */
    contentIncome: { min: 0.8, max: 1.15 },
    contentLevies: { min: 0.7, max: 1.15 },
    contentDevelopment: { min: 0.4, max: 1.4 },
    /** Révolte paysanne possible sous ce seuil (chance par point manquant). */
    revoltThreshold: 22,
    revoltPerPoint: 0.012,
    lootContentment: -15,
    occupiedContentment: -2,
    plagueContentment: -3,
    chapelContentment: 1,
    /** Emprunts : intérêt par saison, plafond en saisons de revenus du domaine. */
    loanRate: 0.05,
    loanCapSeasons: 8,
    loanMin: 50,
    loanDefaultPrestige: -60,
    /** IA : impôts élevés si le trésor est sous la réserve et le peuple content. */
    aiRaiseTaxContentment: 55,
    aiLowerTaxContentment: 35,
  },

  /** Cour : capacité, salaires, recrutement. */
  entourage: {
    /** Courtisans extérieurs sans salaire : base + rang + Gestion/gestionPerSlot. */
    freeBase: 4,
    freeRank: { aucun: 0, comte: 0, duc: 1, roi: 3 },
    gestionPerSlot: 6,
    /** Salaire par saison : wageBase + wagePerSkill × meilleure compétence. */
    wageBase: 0.8,
    wagePerSkill: 0.12,
    /** Prime d'engagement : feeBase + feePerSkill × meilleure compétence. */
    feeBase: 15,
    feePerSkill: 4,
    candidates: { base: 3, perPrestige: 400, max: 5, expireSeasons: 4 },
    /** Acceptation d'un candidat. */
    accept: {
      base: 20,
      prestigeDiv: 25,
      prestigeCap: 15,
      diploPerPoint: 1.5,
      fameFrom: 13,
      famePerPoint: 7,
    },
    /** Départ d'un courtisan congédié ou impayé. */
    leaveOpinion: -5,
    arrearsOpinion: -8,
    /** Rallier un prisonnier : prime et chances. */
    rally: { fee: 40, base: 15, opinionFactor: 0.35, failOpinion: -10, formerLordOpinion: -15 },
    /** Pupilles. */
    ward: {
      base: -8,
      opinionFactor: 0.7,
      prestigeDiv: 40,
      prestigeCap: 10,
      vassalOpinion: 10,
      returnOpinion: 15,
      keepOpinion: -8,
      keepLoyalty: 25,
    },
    /** Débauchage. */
    poach: {
      base: -25,
      opinionFactor: 0.5,
      prestigeDiv: 30,
      prestigeCap: 15,
      diploPerPoint: 1.5,
      councilPenalty: 15,
      allyPenalty: 20,
      friendPenalty: 15,
      ambitieux: 10,
      avare: 8,
      lache: 5,
      lordOpinion: -25,
      lordOpinionSeasons: 20,
      failLordOpinion: -8,
      failPrestige: -5,
    },
  },

  /** Trésorier : politique de trésorerie du joueur. */
  treasury: {
    /** Réserve visée : on agit si l'or prévu à la saison suivante passe sous ce seuil. */
    reserve: 0,
    /** Comtés dont les impôts montent d'un cran par saison (à contentement suffisant). */
    taxStepCounties: 3,
    taxMinContentment: 60,
  },

  realm: {
    duchyMinShare: 0.5,
    kingdomMinShare: 0.6,
    kingdomPrestigeCost: 600,
    kingdomGoldCost: 300,
    duchyPrestigeCost: 150,
    duchyGoldCost: 100,
  },

  war: {
    attritionBase: 0.02,
    attritionWinter: 2,
    attritionNoSupply: 3,
    supplyFriendly: 25,
    supplyEnemy: -15,
    supplyEnemyWinter: -25,
    lootSupply: 40,
    lootOpinion: -15,
    lootDevelopment: 1,
    lootGold: 30,
    siegeBase: 1,
    assaultLosses: 0.15,
    assaultLossesPerFort: 0.06,
    occupation: 10,
    occupationObjective: 20,
    capture: 50,
    objectiveHeld: 5,
    objectiveHeldSeasons: 4,
    peaceThreshold: 50,
    whitePeaceAi: -40,
    leviesDecayAfter: 8,
    leviesDecayRate: 0.1,
    conquestPrestige: 250,
    claimPrestige: 0,
    ransomGold: 150,
    peaceWinnerPrestige: 50,
    peaceLoserPrestige: -40,
    warExhaustionPerSeason: -1,
    forceRatioToDeclare: 1.3,
    minWarSeasons: 2,
    callToArmsOpinion: 30,
  },

  diplomacy: {
    acceptThreshold: 0,
    marriage: { base: 10, perOpinion: 0.5, rankBonus: 15, allianceInterest: 10 },
    alliance: { base: -10, perOpinion: 0.6, threatInterest: 20 },
    callToArms: { base: 10, perOpinion: 0.7 },
    tribute: { base: -40, perPowerRatio: 30, perOpinion: 0.3, amount: 60 },
    traitModifiers: {
      genereux: 10,
      avare: -5,
      ambitieux: -10,
      satisfait: 10,
      juste: 5,
      cruel: -5,
      prudent: 5,
      impetueux: -5,
    },
    prestigeMarriage: 20,
  },

  council: {
    improveRelations: 2,
    fabricateClaimChance: 0.04,
    trainTroopsMorale: 1,
    levyBonus: 0.15,
    collectTaxes: 0.1,
    developChance: 0.03,
    discoverPlotChance: 0.04,
    spyDuration: 4,
    pietyPerSavoir: 0.3,
    educateBonus: 0.5,
  },

  intrigue: {
    progressBase: 4,
    progressPerRuse: 1.2,
    progressPerAgent: 3,
    maxAgents: 5,
    agentCost: 15,
    discoveryBase: 0.06,
    discoveryPerAgent: 0.015,
    discoveryPerTargetRuse: 0.004,
    discoveryPerOwnRuse: -0.003,
    discoveredOpinion: -40,
    discoveredPrestige: -40,
    discreditPrestige: -80,
    discreditOpinion: -25,
    assassinKillChance: 0.75,
    /** Après un assassinat réussi : la famille de la victime devine-t-elle qui a frappé ? */
    assassinSuspicion: 0.35,
    /** Stress de l'assassin selon ses traits, et en plus si la victime est un enfant. */
    assassinStress: { juste: 15, genereux: 10, cruel: -5 },
    assassinChildStress: { '*': 10, juste: 15, genereux: 10, cruel: -10 },
    friendshipOpinion: 40,
    aiPlotChance: 0.05,
  },

  /** Faits de saison chez les souverains de l'IA (data/abroad.ts). */
  abroad: {
    /** Chance par souverain indépendant et par saison. */
    chancePerRuler: 0.12,
    /** Développement minimal après un fait (le maximum est economy.developmentMax). */
    minDevelopment: 1,
  },

  ai: {
    goldReserveSeasons: 2,
    buildChance: 0.35,
    marriageChance: 0.15,
    allianceChance: 0.08,
    plotChance: 0.05,
    warBaseChance: 0.12,
    revoltFactionRatio: 0.8,
    recruitShare: 0.4,
    disbandWhenPeace: true,
  },
} as const;

export type Balance = typeof BALANCE;
