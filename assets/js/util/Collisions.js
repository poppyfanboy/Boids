import * as THREE from 'three';
import { maxComponent, minComponent } from './Vectors.js';

const unitVectors = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
];

const signedUnitVectors = [
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
];

/**
 * @typedef RayIntersectionPoint
 * @type {object}
 * @property {THREE.Vector3} point
 * @property {THREE.Vector3} normal
 * @property {Number} distance
 */

/**
 * The ray has a direction and a maximum length, thus, the ray won't collide
 * with AABBs which are behind the ray's origin or too far away from the origin.
 * @param {THREE.Ray} ray
 * @param {THREE.Box3} aabb
 * @returns {RayIntersectionPoint} an array of object which represent collision
 */
export function rayVsAabb(ray, aabb, rayMaxLength = Infinity, epsilon = 1e-3) {
    const normalizedDirection = ray.direction.clone().normalize();

    const near = aabb.min.clone().sub(ray.origin).divide(normalizedDirection);
    const far = aabb.max.clone().sub(ray.origin).divide(normalizedDirection);
    const tNear = maxComponent(near.clone().min(far), 3);
    const tFar = minComponent(near.clone().max(far), 3);

    if (tNear > tFar || tFar < 0 || tNear > 0 && rayMaxLength < tNear || rayMaxLength < tFar) {
        return null;
    }

    const closestIntersection = ray.origin
        .clone()
        .add(normalizedDirection.clone().multiplyScalar(tNear > 0 ? tNear : tFar));

    const aabbCenter = new THREE.Vector3();
    aabb.getCenter(aabbCenter);

    // coordinates relative to the AABB center
    const fromCenterToIntersection = closestIntersection.clone().sub(aabbCenter);
    const aabbMin = aabb.min.clone().sub(aabbCenter);
    const aabbMax = aabb.max.clone().sub(aabbCenter);

    const normal = new THREE.Vector3();
    for (let i = 0; i < signedUnitVectors.length; i++) {
        if (
            i < 3 &&
            Math.abs(fromCenterToIntersection.getComponent(i % 3) - aabbMin.getComponent(i % 3)) <
                epsilon
        ) {
            normal.add(signedUnitVectors[i + 3]);
        }

        if (
            i >= 3 &&
            Math.abs(fromCenterToIntersection.getComponent(i % 3) - aabbMax.getComponent(i % 3)) <
                epsilon
        ) {
            normal.add(signedUnitVectors[i - 3]);
        }
    }
    normal.normalize().multiplyScalar(aabb.containsPoint(ray.origin) ? 1 : -1);

    return { point: closestIntersection, normal: normal, distance: tNear > 0 ? tNear : tFar };
}

/**
 * @typedef LineIntersectionPoint
 * @type {object}
 * @property {THREE.Vector3} point
 * @property {Number} distance
 */

/**
 * Unlike the `rayVsAabb` function, this one takes into account neither whether
 * the intersection point is behind the line "origin", nor the maximum distance
 * from the line "origin".
 * @param {THREE.Ray} line
 * @param {THREE.Box3} aabb
 * @returns {Array.<LineIntersectionPoint>} an array of intersection points
 * in order from the closest to the farthest (relative to the line "origin").
 * There are always either none or two intersection points in the array.
 */
export function lineVsAabb(line, aabb) {
    const normalizedDirection = line.direction.clone().normalize();

    const near = aabb.min.clone().sub(line.origin).divide(normalizedDirection);
    const far = aabb.max.clone().sub(line.origin).divide(normalizedDirection);
    let tNear = maxComponent(near.clone().min(far), 3);
    let tFar = minComponent(near.clone().max(far), 3);

    if (tNear > tFar) {
        return [];
    }

    if (Math.abs(tNear) > Math.abs(tFar)) {
        const swap = tNear;
        tNear = tFar;
        tFar = swap;
    }

    return [
        {
            point: line.origin.clone().add(normalizedDirection.clone().multiplyScalar(tNear)),
            distance: tNear,
        },
        {
            point: line.origin.clone().add(normalizedDirection.clone().multiplyScalar(tFar)),
            distance: tFar,
        },
    ];
}
