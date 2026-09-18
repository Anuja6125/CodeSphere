const fs = require("fs");
const path = require("path");

const ignoredTopLevelItems = ["__MACOSX", ".DS_Store"];

const resolveProjectRoot = (extractPath) => {
    const items = fs.readdirSync(extractPath).filter((item) => {
        return !ignoredTopLevelItems.includes(item);
    });

    if (items.length !== 1) {
        return extractPath;
    }

    const onlyItemPath = path.join(extractPath, items[0]);

    if (fs.statSync(onlyItemPath).isDirectory()) {
        return onlyItemPath;
    }

    return extractPath;
};

module.exports = {
    resolveProjectRoot
};
