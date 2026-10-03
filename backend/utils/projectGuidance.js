const buildWhereToStart = (stats, unresolved) => {
    const suggestions = [];
    const seen = new Set();

    for (const file of stats.entryFiles) {
        suggestions.push({
            file,
            role: "entry",
            reason: "Start here. Nothing else in the project imports this file, but it depends on other project files."
        });
        seen.add(file);
    }

    for (const item of stats.mostImported) {
        if (seen.has(item.file)) {
            continue;
        }

        suggestions.push({
            file: item.file,
            role: "shared",
            reason: `Look at this next. It is imported by ${item.importedByCount} other file(s), so it is a shared part of the project.`
        });
        seen.add(item.file);

        if (suggestions.length >= 5) {
            break;
        }
    }

    const notes = [];

    if (unresolved.length > 0) {
        notes.push(
            `${unresolved.length} relative import(s) could not be matched to a scanned file.`
        );
    }

    return {
        suggestions,
        notes
    };
};

module.exports = {
    buildWhereToStart
};
