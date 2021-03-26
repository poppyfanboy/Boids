import * as THREE from 'three';
import { Vector3 } from 'three';
import { aabbCenteredAt, aabbInsideSphere } from '../util/Aabbs';

const MESH_MAX_POINTS = 50_000;
const BRUTE_FORCE_THRESHOLD = 30;

function addBoxToBuffer(
    box: THREE.Box3,
    positions: Float32Array,
    positionsOffset: number,
    indices: number[],
    indicesOffset: number,
) {
    const halfSize = new Vector3();
    box.getSize(halfSize);
    halfSize.divideScalar(2);

    const center = new Vector3();
    box.getCenter(center);

    const positionVectors: Vector3[] = [
        // y = aabb.min.y plane
        new Vector3(-1, -1, 1).multiply(halfSize).add(center),
        new Vector3(1, -1, 1).multiply(halfSize).add(center),
        new Vector3(1, -1, -1).multiply(halfSize).add(center),
        new Vector3(-1, -1, -1).multiply(halfSize).add(center),

        // y = aabb.max.y plane
        new Vector3(-1, 1, 1).multiply(halfSize).add(center),
        new Vector3(1, 1, 1).multiply(halfSize).add(center),
        new Vector3(1, 1, -1).multiply(halfSize).add(center),
        new Vector3(-1, 1, -1).multiply(halfSize).add(center),
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
 */
const CHILDREN_CENTERS: Vector3[] = Array.from({ length: 8 }, (_, i) =>
    new Vector3(
        i % 2 == 0 ? 1 : -1,
        Math.floor(i / 2) % 2 == 0 ? 1 : -1,
        Math.floor(i / 4) % 2 == 0 ? 1 : -1,
    ).multiplyScalar(0.25),
);

export interface TreeElement {
    position: Vector3;
}

class Node<TElement extends TreeElement> {
    private isSubdivided = false;
    private elements: TElement[] = [];
    private count = 0;
    private children: Node<TElement>[] = [];

    constructor(private boundary: THREE.Box3, private depth: number) {}

    /**
     * @returns if the point was inserted into the tree
     */
    insert(element: TElement, capacity: number, maxDepth: number): boolean {
        if (!this.boundary.containsPoint(element.position)) {
            return false;
        }

        if (this.elements.length < capacity || this.depth == maxDepth) {
            this.elements.push(element);
            this.count++;
            return true;
        }
        if (!this.isSubdivided) {
            this.subdivide();
        }
        for (let i = 0; i < this.children.length; i++) {
            if (this.children[i]?.insert(element, capacity, maxDepth)) {
                this.count++;
                return true;
            }
        }
        return false;
    }

    clear(): void {
        this.children = [];
        this.isSubdivided = false;
        this.elements = [];
    }

    subdivide(): void {
        const parentSize = new Vector3();
        this.boundary.getSize(parentSize);
        const childSize: Vector3 = parentSize.clone().divideScalar(2);
        const parentCenter = new Vector3();
        this.boundary.getCenter(parentCenter);

        for (let i = 0; i < CHILDREN_CENTERS.length; i++) {
            const normalizedCenter: Vector3 = CHILDREN_CENTERS[i];
            const childCenter: Vector3 = normalizedCenter
                .clone()
                .multiply(parentSize)
                .add(parentCenter);
            const childBoundary: THREE.Box3 = aabbCenteredAt(childCenter, childSize);
            this.children[i] = new Node(childBoundary, this.depth + 1);
        }

        this.isSubdivided = true;
    }

    boundaries(yieldBoundary: (boundary: THREE.Box3) => void) {
        const nodesToVisit: Node<TElement>[] = [ this ];
        let currentNode: Node<TElement> | undefined = undefined;
        while ((currentNode = nodesToVisit.pop()) != undefined) {
            if (currentNode.isSubdivided) {
                nodesToVisit.push(...currentNode.children);
            }
            if (currentNode.elements.length > 0 && !currentNode.isSubdivided) {
                yieldBoundary(currentNode.boundary);
            }
        }
    }

    /**
     * Generates all the points stored in the tree.
     */
    getAllElements(yieldElement: (element: TElement) => void) {
        for (let i = 0; i < this.elements.length; i++) {
            yieldElement(this.elements[i]);
        }

        if (!this.isSubdivided) {
            return;
        }

        for (let i = 0; i < this.children.length; i++) {
            if (this.children[i].elements.length > 0) {
                this.children[i].getAllElements(yieldElement);
            }
        }
    }

    queryElementsFromSphere(sphereRange: THREE.Sphere, yieldElement: (element: TElement) => void) {
        if (!this.boundary.intersectsSphere(sphereRange)) {
            return;
        }
        if (aabbInsideSphere(this.boundary, sphereRange)) {
            this.getAllElements(yieldElement);
            return;
        }
        if (this.count < BRUTE_FORCE_THRESHOLD) {
            this.getAllElements(element => {
                if (sphereRange.containsPoint(element.position)) {
                    yieldElement(element);
                }
            });
            return;
        }
        for (let i = 0; i < this.elements.length; i++) {
            if (sphereRange.containsPoint(this.elements[i].position)) {
                yieldElement(this.elements[i]);
            }
        }
        if (!this.isSubdivided) {
            return;
        }
        for (let i = 0; i < this.children.length; i++) {
            this.children[i].queryElementsFromSphere(sphereRange, yieldElement);
        }
    }
}

type OctreeMeshData = {
    color: number;
    meshMaxPoints: number;
    indices: number[];
    mesh: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | null;
};

export default class Octree<TElement extends TreeElement> {
    private root: Node<TElement>;
    private maxDepth: number;
    private nodeCapacity: number;
    private meshData: OctreeMeshData;

    /**
     * @param nodeCapacity if it happens that after new point insertion
     * an octree node has more than `nodeCapacity` points, this node is
     * subdivided.
     */
    constructor(
        boundary: THREE.Box3,
        nodeCapacity = 4,
        maxDepth = 4,
        color = 0xffffff,
        meshMaxPoints = MESH_MAX_POINTS,
    ) {
        this.root = new Node(boundary, 0);
        this.maxDepth = maxDepth;
        this.nodeCapacity = nodeCapacity;

        this.meshData = {
            color: color,
            meshMaxPoints: meshMaxPoints,
            indices: [],
            mesh: null,
        };
    }

    get mesh(): THREE.LineSegments {
        if (this.meshData.mesh == null) {
            this.meshData.mesh = this.createNewMesh();
        }
        return this.meshData.mesh;
    }

    insert(element: TElement): boolean {
        return this.root.insert(element, this.nodeCapacity, this.maxDepth);
    }

    clear(): void {
        this.root.clear();
    }

    queryElementsFromSphere(
        sphereRange: THREE.Sphere,
        yieldElement: (element: TElement) => void,
    ): void {
        this.root.queryElementsFromSphere(sphereRange, yieldElement);
    }

    createNewMesh(): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(3 * this.meshData.meshMaxPoints);

        this.meshData.indices = [];
        geometry.setIndex(this.meshData.indices);

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setDrawRange(0, 0);

        const material = new THREE.LineBasicMaterial({
            color: this.meshData.color,
            linewidth: 2,
        });

        return new THREE.LineSegments(geometry, material);
    }

    updateMesh(): void {
        if (this.meshData.mesh == null) {
            this.meshData.mesh = this.createNewMesh();
        }

        const positions = this.meshData.mesh.geometry.attributes.position.array as Float32Array;
        let positionsOffset = 0;
        let indicesOffset = 0;

        this.root.boundaries(boundary => {
            addBoxToBuffer(
                boundary,
                positions,
                positionsOffset,
                this.meshData.indices,
                indicesOffset,
            );
            positionsOffset += 8;
            indicesOffset += 24;
        });

        this.meshData.mesh.geometry.setIndex(this.meshData.indices);
        if (this.meshData.mesh.geometry.index == null) {
            console.log(
                `Octree ${this} failed to update its mesh (${this.meshData.mesh}) geometry indices.`,
            );
            return;
        }
        this.meshData.mesh.geometry.index.needsUpdate = true;
        this.meshData.mesh.geometry.setDrawRange(0, indicesOffset);
        this.meshData.mesh.geometry.attributes.position.needsUpdate = true;
        this.meshData.mesh.material.needsUpdate = true;
    }
}
