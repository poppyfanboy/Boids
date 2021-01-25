function getComponentsCount(vector) {
    let count = 0;
    if ('x' in vector) {
        count++;
    }
    if ('y' in vector) {
        count++;
    } else {
        return count;
    }
    if ('z' in vector) {
        count++;
    } else {
        return count;
    }
    if ('w' in vector) {
        count++;
    }
    return count;
}

export function maxComponent(vector) {
    const componentsCount = getComponentsCount(vector);
    if (componentsCount === 0) {
        return null;
    }
    let max = vector.x;
    for (let i = 1; i < componentsCount; i++) {
        if (vector.getComponent(i) > max) {
            max = vector.getComponent(i);
        }
    }
    return max;
}

export function minComponent(vector) {
    const componentsCount = getComponentsCount(vector);
    if (componentsCount === 0) {
        return null;
    }
    let min = vector.x;
    for (let i = 1; i < componentsCount; i++) {
        if (vector.getComponent(i) < min) {
            min = vector.getComponent(i);
        }
    }
    return min;
}
