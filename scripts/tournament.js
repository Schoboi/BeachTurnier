(function () {
  const GROUPS = ["A", "B"];

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function makeTeams(players) {
    return shuffle(players).reduce((teams, player, index) => {
      if (index % 2 === 0) {
        teams.push({ id: uid("team"), name: `Team ${teams.length + 1}`, players: [player] });
      } else {
        teams[teams.length - 1].players.push(player);
      }
      return teams;
    }, []);
  }

  function assignGroups(teams) {
    const shuffled = shuffle(teams);
    return {
      A: shuffled.slice(0, 3).map((team) => ({ ...team, group: "A" })),
      B: shuffled.slice(3, 6).map((team) => ({ ...team, group: "B" })),
    };
  }

  function roundRobinMatches(groups) {
    const matches = [];
    GROUPS.forEach((group) => {
      const teams = groups[group] || [];
      [[0, 1], [1, 2], [0, 2]].forEach((pair, index) => {
        matches.push({
          id: uid("group"),
          phase: "group",
          group,
          label: `Gruppe ${group} · Spiel ${index + 1}`,
          bestOf: 1,
          target: 15,
          teamA: teams[pair[0]]?.id,
          teamB: teams[pair[1]]?.id,
          sets: [{ a: "", b: "" }],
        });
      });
    });
    return matches;
  }

  function createTournament(players) {
    const teams = makeTeams(players);
    const groups = assignGroups(teams);
    return {
      players,
      teams: [...groups.A, ...groups.B],
      groups,
      matches: roundRobinMatches(groups),
      finals: [],
      createdAt: new Date().toISOString(),
    };
  }

  function parseScore(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function completedSets(match) {
    return (match.sets || [])
      .map((set) => ({ a: parseScore(set.a), b: parseScore(set.b) }))
      .filter((set) => set.a !== null && set.b !== null && set.a !== set.b);
  }

  function matchResult(match) {
    const sets = completedSets(match);
    if (sets.length === 0) return null;
    const winsA = sets.filter((set) => set.a > set.b).length;
    const winsB = sets.filter((set) => set.b > set.a).length;
    const needed = Math.ceil((match.bestOf || 1) / 2);
    if (winsA < needed && winsB < needed) return null;
    const pointsA = sets.reduce((sum, set) => sum + set.a, 0);
    const pointsB = sets.reduce((sum, set) => sum + set.b, 0);
    return {
      winner: winsA > winsB ? match.teamA : match.teamB,
      loser: winsA > winsB ? match.teamB : match.teamA,
      pointsA,
      pointsB,
      diffA: pointsA - pointsB,
      diffB: pointsB - pointsA,
      setsA: winsA,
      setsB: winsB,
    };
  }

  function standingsForGroup(group, tournament) {
    const rows = (tournament.groups[group] || []).map((team) => ({
      teamId: team.id,
      team,
      wins: 0,
      losses: 0,
      pointDiff: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    }));
    const byId = new Map(rows.map((row) => [row.teamId, row]));
    tournament.matches
      .filter((match) => match.phase === "group" && match.group === group)
      .forEach((match) => {
        const result = matchResult(match);
        if (!result) return;
        const a = byId.get(match.teamA);
        const b = byId.get(match.teamB);
        a.pointsFor += result.pointsA;
        a.pointsAgainst += result.pointsB;
        a.pointDiff += result.diffA;
        b.pointsFor += result.pointsB;
        b.pointsAgainst += result.pointsA;
        b.pointDiff += result.diffB;
        if (result.winner === match.teamA) {
          a.wins += 1;
          b.losses += 1;
        } else {
          b.wins += 1;
          a.losses += 1;
        }
      });

    return rows.sort((left, right) => compareRows(left, right, tournament.matches));
  }

  function compareRows(left, right, matches) {
    const main =
      right.wins - left.wins ||
      right.pointDiff - left.pointDiff ||
      right.pointsFor - left.pointsFor;
    if (main !== 0) return main;
    const directMatch = matches.find((match) => {
      return (
        match.phase === "group" &&
        ((match.teamA === left.teamId && match.teamB === right.teamId) ||
          (match.teamA === right.teamId && match.teamB === left.teamId))
      );
    });
    const directResult = directMatch ? matchResult(directMatch) : null;
    if (directResult?.winner === left.teamId) return -1;
    if (directResult?.winner === right.teamId) return 1;
    return left.team.name.localeCompare(right.team.name, "de");
  }

  function allGroupMatchesComplete(tournament) {
    return tournament.matches.every((match) => matchResult(match));
  }

  function finalsMatches(tournament) {
    const tableA = standingsForGroup("A", tournament);
    const tableB = standingsForGroup("B", tournament);
    if (tableA.length < 3 || tableB.length < 3) return [];
    const existing = new Map((tournament.finals || []).map((match) => [match.slot, match]));
    const fromExisting = (slot, fallback) => {
      const current = existing.get(slot);
      return current ? { ...fallback, id: current.id, sets: current.sets || fallback.sets } : fallback;
    };
    return [
      fromExisting("semi1", makeFinal("semi1", "Halbfinale 1", tableA[0].teamId, tableB[1].teamId, 1)),
      fromExisting("semi2", makeFinal("semi2", "Halbfinale 2", tableB[0].teamId, tableA[1].teamId, 1)),
      fromExisting("place5", makeFinal("place5", "Spiel um Platz 5", tableA[2].teamId, tableB[2].teamId, 1)),
      fromExisting("place3", makeFinal("place3", "Spiel um Platz 3", null, null, 1)),
      fromExisting("final", makeFinal("final", "Finale", null, null, 3)),
    ].map((match, index, finals) => hydrateFinalTeams(match, finals));
  }

  function makeFinal(slot, label, teamA, teamB, bestOf) {
    return {
      id: uid("final"),
      phase: "final",
      slot,
      group: "",
      label,
      bestOf,
      target: 15,
      teamA,
      teamB,
      sets: Array.from({ length: bestOf }, () => ({ a: "", b: "" })),
    };
  }

  function hydrateFinalTeams(match, finals) {
    const semi1 = finals.find((item) => item.slot === "semi1");
    const semi2 = finals.find((item) => item.slot === "semi2");
    const result1 = semi1 ? matchResult(semi1) : null;
    const result2 = semi2 ? matchResult(semi2) : null;
    if (match.slot === "place3") {
      return { ...match, teamA: result1?.loser || null, teamB: result2?.loser || null };
    }
    if (match.slot === "final") {
      return { ...match, teamA: result1?.winner || null, teamB: result2?.winner || null };
    }
    return match;
  }

  function ranking(tournament) {
    const finals = tournament.finals || [];
    const final = finals.find((match) => match.slot === "final");
    const place3 = finals.find((match) => match.slot === "place3");
    const place5 = finals.find((match) => match.slot === "place5");
    const finalResult = final ? matchResult(final) : null;
    const place3Result = place3 ? matchResult(place3) : null;
    const place5Result = place5 ? matchResult(place5) : null;
    return [
      finalResult?.winner,
      finalResult?.loser,
      place3Result?.winner,
      place3Result?.loser,
      place5Result?.winner,
      place5Result?.loser,
    ].filter(Boolean);
  }

  window.BeachTournament = {
    GROUPS,
    createTournament,
    standingsForGroup,
    matchResult,
    allGroupMatchesComplete,
    finalsMatches,
    ranking,
  };
})();
