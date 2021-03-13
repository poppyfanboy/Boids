import * as THREE from 'three';
import { aabbCenteredAt, aabbInsideSphere } from './Aabbs.js';

const MESH_MAX_POINTS = 50000;
const BRUTE_FORCE_THRESHOLD = 30;

/**
 * @param {THREE.Box3} box
 * @param {Float32Array} positions
 * @param {Number} positionsOffset
 * @param {Array.<Number>} indices
 * @param {Number} indicesOffset
 */
function addBoxToBuffer(box, positions, positionsOffset, indices, indicesOffset) {
    const halfSize = new THREE.Vector3();
    box.getSize(halfSize);
    halfSize.divideScalar(2);

    const center = new THREE.Vector3();
    box.getCenter(center);

    const positionVectors = [
        // y = aabb.min.y plane
        new THREE.Vector3(-1, -1, 1).multiply(halfSize).add(center),
        new THREE.Vector3(1, -1, 1).multiply(halfSize).add(center),
        new THREE.Vector3(1, -1, -1).multiply(halfSize).add(center),
        new THREE.Vector3(-1, -1, -1).multiply(halfSize).add(center),

        // y = aabb.max.y plane
        new THREE.Vector3(-1, 1, 1).multiply(halfSize).add(center),
        new THREE.Vector3(1, 1, 1).multiply(halfSize).add(center),
        new THREE.Vector3(1, 1, -1).multiply(halfSize).add(center),
        new THREE.Vector3(-1, 1, -1).multiply(halfSize).add(center),
    ];

    for (let i = 0; i < 8; i++) {
        positions[3 * (i + positionsOffset)] = positionVectors[i].x;
        positions[3 * (i + positionsOffset) + 1] = positionVectors[i].y;
        positions[3 * (i + positionsOffset) + 2] = positionVectors[i].z;
    }

    indices[0 + indicesOffset] = 0 + positionsOffset;
    for (let i = 1; i < 7; i++) {
        indices[i + indicesOffset] = Math.ceil(i / 2) + positionsOffset;
    }
    indices[7 + indicesOffset] = 0 + positionsOffset;

    indices[8 + indicesOffset] = 4 + positionsOffset;
    for (let i = 9; i < 15; i++) {
        indices[i + indicesOffset] = Math.ceil(i / 2) + positionsOffset;
    }
    indices[15 + indicesOffset] = 4 + positionsOffset;

    for (let i = 0; i < 4; i++) {
        indices[16 + 2 * i + indicesOffset] = i + positionsOffset;
        indices[16 + 2 * i + 1 + indicesOffset] = i + 4 + positionsOffset;
    }
}

/**
 * Coordinates of the octree children centers relative to the center of the
 * octree. The octree boundary is considered to be of size (1, 1, 1) with the
 * center in (0, 0, 0).
 * @type {Array.<THREE.Vector3>}
 */
const CHILDREN_CENTERS = Array.from({ length: 8 }, (_, i) =>
    new THREE.Vector3(
        i % 2 === 0 ? 1 : -1,
        Math.floor(i / 2) % 2 === 0 ? 1 : -1,
        Math.floor(i / 4) % 2 === 0 ? 1 : -1
    ).multiplyScalar(0.25)
);

/**
 * @typedef TreeElement
 * @type {object}
 * @property {THREE.Vector3} position
 */

class Node {
    /**
     * @param {THREE.Box3} boundary
     * @param {Number} capacity
     */
    constructor(boundary, capacity) {
        this.boundary = boundary;
        this.capacity = Math.max(1, capacity);
        this.isSubdivided = false;

        /**
         * @type {Array.<TreeElement>}
         */
        this.elements = [];
        this.count = 0;

        /**
         * @type {Array.<Node>}
         */
        this.children = Array(8).fill(null);
    }

    /**
     * @param {TreeElement} element
     * @returns {boolean} if the point was inserted into the tree
     */
    insert(element) {
        if (!this.boundary.containsPoint(element.position)) {
            return false;
        }

        if (this.elements.length < this.capacity) {
            this.elements.push(element);
            this.count++;
            return true;
        }
        if (!this.isSubdivided) {
            this.subdivide();
        }
        for (const child of this.children) {
            if (child.insert(element)) {
                this.count++;
                return true;
            }
        }
        return false;
    }

    clear() {
        this.children.fill(null);
        this.isSubdivided = false;
        this.elements = [];
    }

    subdivide() {
        const parentSize = new THREE.Vector3();
        this.boundary.getSize(parentSize);
        const childSize = parentSize.clone().divideScalar(2);
        const parentCenter = new THREE.Vector3();
        this.boundary.getCenter(parentCenter);

        for (let i = 0; i < CHILDREN_CENTERS.length; i++) {
            const normalizedCenter = CHILDREN_CENTERS[i];
            const childCenter = normalizedCenter.clone().multiply(parentSize).add(parentCenter);
            const childBoundary = aabbCenteredAt(childCenter, childSize);
            this.children[i] = new Node(childBoundary, this.capacity);
        }

        this.isSubdivided = true;
    }

    *boundaries() {
        const nodesToVisit = [ this ];
        while (nodesToVisit.length !== 0) {
            const currentNode = nodesToVisit.shift();
            if (currentNode.isSubdivided) {
                nodesToVisit.push(...currentNode.children);
            }
            if (currentNode.elements.length > 0 && !currentNode.isSubdivided) {
                yield currentNode.boundary;
            }
        }
    }

    /**
     * Generates all the points stored in the tree.
     */
    *getAllElements() {
        yield* this.elements;

        if (!this.isSubdivided) {
            return;
        }

        for (const child of this.children) {
            yield* child.getAllElements();
        }
    }

    /**
     * @param {THREE.Sphere} sphereRange
     */
    *queryPointsFromSphere(sphereRange) {
        if (!this.boundary.intersectsSphere(sphereRange)) {
            return;
        }
        if (aabbInsideSphere(this.boundary, sphereRange)) {
            yield* this.getAllElements();
            return;
        }
        if (this.count < BRUTE_FORCE_THRESHOLD) {
            for (const element of this.getAllElements()) {
                if (sphereRange.containsPoint(element.position)) {
                    yield element;
                }
            }
            return;
        }
        for (const element of this.elements) {
            if (sphereRange.containsPoint(element.position)) {
                yield element;
            }
        }
        if (!this.isSubdivided) {
            return;
        }
        for (const child of this.children) {
            yield* child.queryPointsFromSphere(sphereRange);
        }
    }
}

export default class Octree {
    /**
     * @param {THREE.Box3} boundary
     * @param {Number} nodeCapacity if it happens that after new point insertion
     * an octree node has more than `nodeCapacity` points, this node is
     * subdivided.
     */
    constructor(boundary, nodeCapacity = 4, color = 0xffffff, meshMaxPoints = MESH_MAX_POINTS) {
        this.root = new Node(boundary, nodeCapacity);

        this.color = color;
        this.meshMaxPoints = meshMaxPoints;

        /**
         * @type {Array.<Number>}
         */
        this.indices = null;

        /**
         * @type {THREE.LineSegments}
         */
        this._mesh = null;
    }

    get mesh() {
        if (this._mesh === null) {
            this.createNewMesh();
        }
        return this._mesh;
    }

    insert(element) {
        this.root.insert(element);
    }

    clear() {
        this.root.clear();
    }

    /**
     * @param {THREE.Sphere} sphereRange
     */
    *queryElementsFromSphere(sphereRange) {
        yield* this.root.queryPointsFromSphere(sphereRange);
    }

    createNewMesh() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(3 * this.meshMaxPoints);

        // worst case, when none of the buffer entries are reused
        this.indices = [];
        geometry.setIndex(this.indices);

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setDrawRange(0, 0);

        const material = new THREE.LineBasicMaterial({
            color: this.color,
            linewidth: 2,
        });

        this._mesh = new THREE.LineSegments(geometry, material);
    }

    updateMesh() {
        if (this._mesh === null) {
            this.createNewMesh();
        }

        const positions = this._mesh.geometry.attributes.position.array;

        let positionsOffset = 0;
        let indicesOffset = 0;
        for (const boundary of this.root.boundaries()) {
            addBoxToBuffer(boundary, positions, positionsOffset, this.indices, indicesOffset);
            positionsOffset += 8;
            indicesOffset += 24;
        }

        this._mesh.geometry.setIndex(this.indices);
        this._mesh.geometry.index.needsUpdate = true;
        this._mesh.geometry.setDrawRange(0, indicesOffset);
        this._mesh.geometry.attributes.position.needsUpdate = true;
        this._mesh.material.needsUpdate = true;
        this._mesh.geometry.computeBoundingBox();
        this._mesh.geometry.computeBoundingSphere();
    }
}
